use anchor_lang::prelude::*;
use anchor_spl::{token, associated_token};
use errors::PostboxErrorCode;
use post_restrictions::AdditionalAccountIndices;
use settings::{SettingsData, SettingsType};

mod errors;
mod nft_metadata;
mod post_restrictions;
mod settings;
mod treasury;

#[cfg(feature = "mainnet")]
declare_id!("DHepkufWDLJ9DCD37nbEDbPSFKjGiziQ6Lbgo1zgGX7S");
#[cfg(not(feature = "mainnet"))]
declare_id!("Fs5wSa7GYtTqivXGqHyx673v5oPuD5Cb7ij9utsFKdLb");

const PROTOCOL_SEED: & str = "dispatch";
const POSTBOX_SEED: & str = "postbox";
const POST_SEED: & str = "post";
const MODERATOR_SEED: & str = "moderator";

#[constant]
const POSTBOX_GROW_CHILDREN_BY: u32 = 1;

#[constant]
const FEE_NEW_POSTBOX: u64 = 1_000_000_000;
#[constant]
const FEE_NEW_PERSONAL_BOX: u64 = 50_000;
#[constant]
const FEE_POST: u64 = 50_000;
#[constant]
const FEE_VOTE: u64 = 50_000;

const MAX_VOTE: u16 = 60_000;

// Features to support:
// --------------------
// initialize postbox (done)
// create post (done)
// delete by poster (done)
// delete by moderator (done)
// issue moderator token (done)
// vote (done)

#[program]
pub mod postbox {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, target: String, owners: Vec<Pubkey>, desc: Option<SettingsData>) -> Result<()> {
        let mut fee = FEE_NEW_POSTBOX;
        if 0 == target.len() {  // Should be personal
            require!(ctx.accounts.target_account.key() == ctx.accounts.signer.key(), PostboxErrorCode::NotPersonalPostbox);
            fee = FEE_NEW_PERSONAL_BOX;
        }

        let postbox_account = &mut ctx.accounts.postbox;
        postbox_account.max_child_id = 0;
        postbox_account.moderator_mint = ctx.accounts.moderator_mint.key();
        postbox_account.settings = vec!(
            SettingsData::OwnerInfo { owners },
        );

        match desc {
            None => {},
            Some(SettingsData::Description { title: _, desc: _}) => postbox_account.settings.push(desc.unwrap()),
            _ => return Err(Error::from(PostboxErrorCode::BadDescriptionSetting).with_source(source!())),
        }

        treasury::transfer_lamports(&ctx.accounts.signer, &ctx.accounts.treasury, fee)?;
        Ok(())
    }

    pub fn create_post (ctx: Context<CreatePost>, data: Vec<u8>, post_id: u32,
        settings: Vec<SettingsData>,
        additional_account_offsets: Vec<AdditionalAccountIndices>,
    ) -> Result<()> {
        let postbox_account = &mut ctx.accounts.postbox;
        require!(post_id <= postbox_account.max_child_id + POSTBOX_GROW_CHILDREN_BY, PostboxErrorCode::PostIdTooLarge);
        if post_id >= postbox_account.max_child_id {
            postbox_account.max_child_id += POSTBOX_GROW_CHILDREN_BY;
        }

        let post_account = &mut ctx.accounts.post;
        post_account.poster = ctx.accounts.poster.key();
        post_account.data = data;
        for setting in settings {
            post_account.set_setting(&setting)?;
        }

        let reply_to_post: Option<Account<Post>> = if ctx.accounts.reply_to.key() == Pubkey::default() {
            None
        } else {
            // Check that we are actually replying to a post
            Some(Account::<Post>::try_from(&ctx.accounts.reply_to)?)
        };
        post_account.reply_to = reply_to_post.as_ref().map(|p| p.key());

        let optional_override = ctx.accounts.postbox.validate_post_interaction_is_allowed(
            reply_to_post.as_ref(),
            &ctx.accounts.poster.key(),
            ctx.remaining_accounts,
            &additional_account_offsets,
            post_account.get_setting(SettingsType::PostRestriction).is_some(),
        )?;
        if let Some(restriction) = optional_override {
            post_account.set_setting(&restriction)?;
        }

        emit!(PostEvent {
            poster_pubkey: ctx.accounts.poster.key(),
            postbox_pubkey: ctx.accounts.postbox.key(),
            post_pubkey: post_account.key(),
            post_id: post_id,
            data: post_account.data.clone(),
            reply_to: post_account.reply_to,
        });

        treasury::transfer_lamports(&ctx.accounts.poster, &ctx.accounts.treasury, FEE_POST)?;
        Ok(())
    }

    pub fn delete_own_post(ctx: Context<DeleteOwnPost>, post_id: u32) -> Result<()> {
        emit!(DeleteEvent {
            deleter_pubkey: ctx.accounts.poster.key(),
            postbox_pubkey: ctx.accounts.postbox.key(),
            post_pubkey: ctx.accounts.post.key(),
            post_id: post_id,
        });
        Ok(())
    }

    pub fn delete_post_by_moderator(ctx: Context<DeletePostByModerator>, post_id: u32) -> Result<()> {
        emit!(DeleteEvent {
            deleter_pubkey: ctx.accounts.moderator.key(),
            postbox_pubkey: ctx.accounts.postbox.key(),
            post_pubkey: ctx.accounts.post.key(),
            post_id: post_id,
        });
        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, _post_id: u32, up_vote: bool,
        additional_account_offsets: Vec<AdditionalAccountIndices>,
    ) -> Result<()> {
        let post_account = &mut ctx.accounts.post;

        ctx.accounts.postbox.validate_post_interaction_is_allowed(
            Some(post_account),
            &ctx.accounts.voter.key(),
            ctx.remaining_accounts,
            &additional_account_offsets,
            false,
        )?;

        let vote_count = if up_vote {&mut post_account.up_votes} else {&mut post_account.down_votes};
        *vote_count += if MAX_VOTE == *vote_count {0} else {1};

        treasury::transfer_lamports(&ctx.accounts.voter, &ctx.accounts.treasury, FEE_VOTE)?;
        Ok(())
    }

    pub fn designate_moderator(ctx: Context<DesignateModerator>, target: String) -> Result<()> {
        let target_account_address = ctx.accounts.target_account.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            PROTOCOL_SEED.as_bytes(),
            POSTBOX_SEED.as_bytes(),
            target_account_address.as_ref(),
            target.as_bytes(),
            &[*ctx.bumps.get("postbox").unwrap()],
        ]];

        let mint_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), token::MintTo {
            mint: ctx.accounts.moderator_mint.to_account_info(),
            authority: ctx.accounts.postbox.to_account_info(),
            to: ctx.accounts.moderator_ata.to_account_info(),
        }, signer_seeds);
        token::mint_to(mint_ctx, 1)?;

        Ok(())
    }

    pub fn add_or_update_setting(ctx: Context<AddOrUpdateSetting>, settings_data: SettingsData) -> Result<()> {
        let postbox = & mut ctx.accounts.postbox;
        // TODO: can we do this more efficiently?
        postbox.settings.retain(|s| s.get_type() != settings_data.get_type());
        postbox.settings.push(settings_data);
        resize_account(postbox.to_account_info().as_ref(), & ctx.accounts.owner, postbox.get_size())?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(target: String, owners: Vec<Pubkey>, desc: Option<SettingsData>)]
pub struct Initialize<'info> {
    #[account(init,
        payer = signer,
        // discriminator, max_child_id, moderator_mint, settings vec size, owner enum type, owners vec size, owners, description
        space = 8 + 4 + 32 + 4 + 1 + 4 + 32 * owners.len() + if desc.is_some() {desc.unwrap().get_size()} else {0},
        seeds = [PROTOCOL_SEED.as_bytes(), POSTBOX_SEED.as_bytes(), target_account.key().as_ref(), target.as_bytes()],
        bump,
    )]
    pub postbox: Box<Account<'info, Postbox>>,
    #[account(init,
        payer = signer,
        seeds = [PROTOCOL_SEED.as_bytes(), MODERATOR_SEED.as_bytes(), postbox.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = postbox,
    )]
    pub moderator_mint: Box<Account<'info, token::Mint>>,
    /// CHECK: we use this account's address only for generating the PDA, but it's useful for anchor's auto PDA to have here
    pub target_account: UncheckedAccount<'info>,
    #[account(mut, constraint = owners.contains(signer.key))]
    pub signer: Signer<'info>,
    /// CHECK: we do not access the data in the treasury other than to transfer lamports to it
    #[account(mut, address = treasury::TREASURY_ADDRESS)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(data: Vec<u8>, post_id: u32, settings: Vec<SettingsData>)]
pub struct CreatePost<'info> {
    #[account(init,
        payer = poster,
        space = get_post_projected_size(&settings, &reply_to, &data),
        seeds = [PROTOCOL_SEED.as_bytes(), POST_SEED.as_bytes(), postbox.key().as_ref(), &post_id.to_le_bytes()],
        bump,
    )]
    pub post: Box<Account<'info, Post>>,
    #[account(mut)]
    pub postbox: Box<Account<'info, Postbox>>,
    #[account(mut)]
    pub poster: Signer<'info>,
    /// CHECK: we do not access the data in the treasury other than to transfer lamports to it
    #[account(mut, address = treasury::TREASURY_ADDRESS)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: we allow passing default or a post, checked in body
    pub reply_to: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(post_id: u32)]
pub struct DeleteOwnPost<'info> {
    #[account(mut, close=poster, has_one=poster,
        seeds=[PROTOCOL_SEED.as_bytes(), POST_SEED.as_bytes(), postbox.key().as_ref(), &post_id.to_le_bytes()],
        bump,
    )]
    pub post: Box<Account<'info, Post>>,
    pub postbox: Box<Account<'info, Postbox>>,
    #[account(mut)]
    pub poster: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(post_id: u32)]
pub struct DeletePostByModerator<'info> {
    #[account(mut, close=poster, has_one=poster,
        seeds=[PROTOCOL_SEED.as_bytes(), POST_SEED.as_bytes(), postbox.key().as_ref(), &post_id.to_le_bytes()],
        bump,
    )]
    pub post: Box<Account<'info, Post>>,
    pub postbox: Box<Account<'info, Postbox>>,
    /// CHECK: we do not access the data in the poster other than to transfer lamports to it
    #[account(mut)]
    pub poster: UncheckedAccount<'info>,
    pub moderator: Signer<'info>,
    #[account(
        associated_token::mint = postbox.moderator_mint,
        associated_token::authority = moderator,
        constraint = (moderator_token_ata.amount > 0),
    )]
    pub moderator_token_ata: Account<'info, token::TokenAccount>,
}

#[derive(Accounts)]
#[instruction(post_id: u32)]
pub struct Vote<'info> {
    #[account(
        mut,
        seeds = [PROTOCOL_SEED.as_bytes(), POST_SEED.as_bytes(), postbox.key().as_ref(), &post_id.to_le_bytes()],
        bump,
    )]
    pub post: Box<Account<'info, Post>>,
    #[account(mut)]
    pub postbox: Box<Account<'info, Postbox>>,
    #[account(mut)]
    pub voter: Signer<'info>,
    /// CHECK: we do not access the data in the treasury other than to transfer lamports to it
    #[account(mut, address = treasury::TREASURY_ADDRESS)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(target: String)]
pub struct DesignateModerator<'info> {
    #[account(
        seeds = [PROTOCOL_SEED.as_bytes(), POSTBOX_SEED.as_bytes(), target_account.key().as_ref(), target.as_bytes()],
        bump,
        has_one = moderator_mint,
    )]
    pub postbox: Box<Account<'info, Postbox>>,
    /// CHECK: we use this account's address only for generating the auto PDA + signature
    pub target_account: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [PROTOCOL_SEED.as_bytes(), MODERATOR_SEED.as_bytes(), postbox.key().as_ref()],
        bump,
    )]
    pub moderator_mint: Box<Account<'info, token::Mint>>,
    #[account(mut, constraint = postbox.has_owner(&owner.key))]
    pub owner: Signer<'info>,
    /// CHECK: we do not access the account data other than for address for ATA
    pub new_moderator: UncheckedAccount<'info>,
    #[account(init,
        payer = owner,
        associated_token::mint = moderator_mint,
        associated_token::authority = new_moderator,
    )]
    pub moderator_ata: Box<Account<'info, token::TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddOrUpdateSetting<'info> {
    #[account(mut)]
    pub postbox: Box<Account<'info, Postbox>>,
    #[account(mut, constraint = postbox.has_owner(&owner.key))]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl Postbox {
    pub fn has_owner(&self, potential_owner: & Pubkey) -> bool {
        match self.get_setting(SettingsType::OwnerInfo) {
            Some(SettingsData::OwnerInfo { owners }) => return owners.contains(potential_owner),
            _ => return false,
        }
    }

    pub fn get_setting(&self, settings_type: SettingsType) -> Option<& SettingsData> {
        for setting in &self.settings {
            if setting.get_type() == settings_type {
                return Some(& setting);
            }
        }
        return None;
    }

    pub fn get_size(&self) -> usize {
        // discriminator + max_child_id + moderator_mint + settings_length
        let mut size = 8 + 4 + 32 + 4;
        for setting in & self.settings {
            size += setting.get_size();
        }
        return size;
    }

    pub fn validate_post_interaction_is_allowed(
        &self,
        post_for_interaction: Option<& Account<Post>>,
        interactor_key: &Pubkey,
        remaining_accounts: &[AccountInfo],
        additional_account_offsets: &Vec<AdditionalAccountIndices>,
        trying_to_override: bool,
    ) -> Result<Option<SettingsData>> {
        let mut post_restriction_to_use: Option<&SettingsData> = None;
        let mut post_specific: bool = false;
        if let Some(post) = post_for_interaction {
            post_restriction_to_use = post.get_setting(SettingsType::PostRestriction);
        }
        if post_restriction_to_use.is_some() {
            post_specific = true;
        } else {
            // Postbox setting specifies the default, which can be overriden in a post
            post_restriction_to_use = self.get_setting(SettingsType::PostRestriction);
        }
        if let Some(restriction) = post_restriction_to_use {
            match restriction {
                SettingsData::PostRestriction{ post_restriction } => post_restriction.validate_reply_allowed(
                    interactor_key,
                    remaining_accounts,
                    additional_account_offsets,
                )?,
                _ => {return Err(Error::from(PostboxErrorCode::MalformedSetting).with_source(source!()))},
            };
            if post_specific {
                require!(!trying_to_override, PostboxErrorCode::ReplyCannotRestrictReplies);
                // We need the next post to inherit this, so return it
                return Ok(Some(restriction.clone()));
            }
        }
        Ok(None)
    }
}

impl Post {
    pub fn get_setting(&self, settings_type: SettingsType) -> Option<& SettingsData> {
        for setting in &self.settings {
            if setting.get_type() == settings_type {
                return Some(& setting);
            }
        }
        return None;
    }

    pub fn set_setting(&mut self, new_setting: &SettingsData) -> Result<()> {
        // Some settings types don't make sense on a post
        require!(new_setting.get_type() == SettingsType::PostRestriction, PostboxErrorCode::PostInvalidSettingsType);
        self.settings.retain(|s| s.get_type() != new_setting.get_type());
        self.settings.push(new_setting.clone());
        Ok(())
    }
}

pub fn get_post_projected_size(passed_settings: &Vec<SettingsData>, reply_to: &AccountInfo, data: &Vec<u8>) -> usize {
    // disc + poster + data.len + data + up_votes + down_votes + option + (reply_to) + settings.len
    let mut size = 8 + 32 + 4 + data.len() + 2 + 2 + 1 + (if reply_to.key() != Pubkey::default() {32} else {0}) + 4;
    let mut allow_restriction = true;
    // For post restriction, we inherit rather than allowing you to set it
    let maybe_reply_to_post = Account::<crate::Post>::try_from(reply_to);
    if maybe_reply_to_post.is_ok() {
        if let Some(restriction) = & maybe_reply_to_post.unwrap().get_setting(SettingsType::PostRestriction) {
            size += restriction.get_size();
            allow_restriction = false;
        }
    }
    for setting in passed_settings {
        if !allow_restriction && setting.get_type() == SettingsType::PostRestriction {
            continue;
        }
        size += setting.get_size();
    }
    return size;
}

pub fn resize_account<'info>(data_account: &dyn ToAccountInfo<'info>, funding_account: &dyn ToAccountInfo<'info>, new_size: usize) -> Result<()> {
    let rent = Rent::get()?;
    let new_minimum_balance = rent.minimum_balance(new_size);
    let data_info = data_account.to_account_info();

    if new_minimum_balance > data_info.lamports() {
        let lamports_diff = new_minimum_balance.saturating_sub(data_info.lamports());
        treasury::transfer_lamports(funding_account, data_account, lamports_diff)?;
    } // TODO(mfasman): free up lamports when reducing size (need to sign as PDA in transfer)
    data_info.realloc(new_size, false)?;
    Ok(())
}

#[account]
#[derive(Default)]
pub struct Postbox {
    pub max_child_id: u32,
    pub moderator_mint: Pubkey,
    pub settings: Vec<SettingsData>,
}

#[account]
#[derive(Default)]
pub struct Post {
    poster: Pubkey,
    data: Vec<u8>,
    up_votes: u16,
    down_votes: u16,
    reply_to: Option<Pubkey>,
    settings: Vec<SettingsData>,
}

#[event]
pub struct PostEvent {
    pub poster_pubkey: Pubkey,
    pub postbox_pubkey: Pubkey,
    pub post_pubkey: Pubkey,
    pub post_id: u32,
    pub data: Vec<u8>,
    pub reply_to: Option<Pubkey>,
}

#[event]
pub struct DeleteEvent {
    pub deleter_pubkey: Pubkey,
    pub postbox_pubkey: Pubkey,
    pub post_pubkey: Pubkey,
    pub post_id: u32,
}
