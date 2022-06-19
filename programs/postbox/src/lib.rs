use anchor_lang::prelude::*;
use anchor_spl::{token, associated_token};
use errors::PostboxErrorCode;
use post_restrictions::{PostRestrictionRule, PostRestrictionAccountIndices};

mod errors;
mod nft_metadata;
mod post_restrictions;
mod treasury;

#[cfg(feature = "mainnet")]
declare_id!("Fs5wSa7GYtTqivXGqHyx673v5oPuD5Cb7ij9utsFKdLb");
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

    pub fn create_post(ctx: Context<CreatePost>, data: Vec<u8>, post_id: u32,
        post_restriction: Option<PostRestrictionRule>,
        restriction_account_offsets: Option<PostRestrictionAccountIndices>,
    ) -> Result<()> {
        let postbox_account = &mut ctx.accounts.postbox;
        if post_id > postbox_account.max_child_id + POSTBOX_GROW_CHILDREN_BY {
            return Err(Error::from(PostboxErrorCode::PostIdTooLarge).with_source(source!()));
        }
        if post_id >= postbox_account.max_child_id {
            postbox_account.max_child_id += POSTBOX_GROW_CHILDREN_BY;
        }

        let post_account = &mut ctx.accounts.post;
        post_account.poster = ctx.accounts.poster.key();
        post_account.data = data;

        let reply_to_key = ctx.accounts.reply_to.key();
        if reply_to_key == Pubkey::default() {
            // Postbox setting specifies the default, which can be overriden in a post
            if let Some(forum_post_restriction) = postbox_account.get_setting(SettingsType::PostRestriction) {
                require!(restriction_account_offsets.is_some(), PostboxErrorCode::MissingRequiredOffsets);
                match forum_post_restriction {
                    SettingsData::PostRestriction{ post_restriction } => post_restriction.validate_reply_allowed(
                        &ctx.accounts.poster.key(),
                        ctx.remaining_accounts,
                        &restriction_account_offsets.unwrap(),
                    )?,
                    _ => {return Err(Error::from(PostboxErrorCode::MalformedSetting).with_source(source!()))},
                };
            }
            post_account.reply_to = None;
            post_account.post_restrictions = post_restriction;
        } else {
            let reply_to = Account::<Post>::try_from(&ctx.accounts.reply_to)?;
            if let Some(parent_post_restriction) = &reply_to.post_restrictions {
                require!(restriction_account_offsets.is_some(), PostboxErrorCode::MissingRequiredOffsets);
                parent_post_restriction.validate_reply_allowed(
                    &ctx.accounts.poster.key(),
                    ctx.remaining_accounts,
                    &restriction_account_offsets.unwrap(),
                )?;
            }
            post_account.reply_to = Some(reply_to_key);
            // Inherit our parent post restriction rather than allowing a new one on replies
            require!(post_restriction.is_none(), PostboxErrorCode::ReplyCannotRestrictReplies);
            post_account.post_restrictions = reply_to.post_restrictions.clone();
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

    pub fn vote(ctx: Context<Vote>, _post_id: u32, up_vote: bool) -> Result<()> {
        let post_account = &mut ctx.accounts.post;
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
    /// CHECK: we use this account's address only for generating the PDA
    pub target_account: UncheckedAccount<'info>,
    #[account(mut, constraint = owners.contains(signer.key))]
    pub signer: Signer<'info>,
    /// CHECK: we do not access the data in the fee_receiver other than to transfer lamports to it
    #[account(mut, address = treasury::TREASURY_ADDRESS)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
// TODO: pass in the new message as a full account, then validate it
#[instruction(data: Vec<u8>, post_id: u32, post_restriction: Option<PostRestrictionRule>)]
pub struct CreatePost<'info> {
    #[account(init,
        payer = poster,
        space = 8 + 32 + 4 + data.len() + 2 + 2 + 1 + (if reply_to.key() != Pubkey::default() {32} else {0}) + 1 + (
            if post_restriction.is_some() {post_restriction.unwrap().get_size()} else {0}
        ) + post_restrictions::get_reply_restriction_size(&reply_to),
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
    /// CHECK: we do not access the data in the fee_receiver other than to transfer lamports to it
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
    /// CHECK: we do not access the data in the fee_receiver other than to transfer lamports to it
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
    /// CHECK: we use this account's address only for generating the PDA signature
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

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub enum SettingsType {
    Description,
    OwnerInfo,
    PostRestriction,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub enum SettingsData {
    Description { title: String, desc: String },
    OwnerInfo { owners: Vec<Pubkey> },
    PostRestriction { post_restriction: PostRestrictionRule },
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
}

impl SettingsData {
    pub fn get_size(&self) -> usize {
        return match self.try_to_vec() {
            Ok(v) => v.len(),
            Err(_) => 0,
        };
    }

    pub fn get_type(&self) -> SettingsType {
        return match self {
            SettingsData::Description { title: _, desc: _ } => SettingsType::Description,
            SettingsData::OwnerInfo { owners: _ } => SettingsType::OwnerInfo,
            SettingsData::PostRestriction { post_restriction: _ } => SettingsType::PostRestriction,
        };
    }
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
    post_restrictions: Option<PostRestrictionRule>,
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
