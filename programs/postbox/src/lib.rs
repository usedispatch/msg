use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::{token, associated_token};
mod treasury;

#[cfg(feature = "mainnet")]
declare_id!("Fs5wSa7GYtTqivXGqHyx673v5oPuD5Cb7ij9utsFKdLb");
#[cfg(not(feature = "mainnet"))]
declare_id!("Fs5wSa7GYtTqivXGqHyx673v5oPuD5Cb7ij9utsFKdLb");

const PROTOCOL_SEED: & str = "dispatch";
const POSTBOX_SEED: & str = "postbox";
const POST_SEED: & str = "post";
const MODERATOR_SEED: & str = "moderator";
const OWNER_SEED: & str = "owners";
const DESCRIPTION_SEED: & str = "description";
const POST_RESTRICTIONS_SEED: & str = "post_restrictions";

const POSTBOX_INIT_SETTINGS: usize = 3;
#[constant]
const POSTBOX_GROW_CHILDREN_BY: u32 = 1;

const INIT_SETTINGS_VERSION: u32 = 0;

#[constant]
const FEE_NEW_POSTBOX: u64 = 1_000_000_000;
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

    pub fn initialize(ctx: Context<Initialize>, target: String, owners: Vec<Pubkey>) -> Result<()> {
        if 0 == owners.len() || !owners.contains(&ctx.accounts.signer.key()) {
            return Err(Error::from(ProgramError::InvalidArgument).with_source(source!()));
        }
        if 0 == target.len() && ctx.accounts.target_account.key() != ctx.accounts.signer.key() {
            return Err(Error::from(ProgramError::InvalidArgument).with_values(("Target string must have a value", target)));
        }

        let owner_settings_account = &mut ctx.accounts.owner_settings;
        owner_settings_account.data = SettingsAccountData::OwnerInfo { owners };

        let postbox_account = &mut ctx.accounts.postbox;
        postbox_account.max_child_id = 0;
        postbox_account.moderator_mint = ctx.accounts.moderator_mint.key();
        postbox_account.settings_accounts = vec!(
            SettingsAddress {
                settings_type: SettingsAccountType::OwnerInfo,
                address: owner_settings_account.key(),
            },
        );

        system_instruction::transfer(&ctx.accounts.signer.key(), &ctx.accounts.treasury.key(), FEE_NEW_POSTBOX);
        Ok(())
    }

    pub fn create_post(ctx: Context<CreatePost>, data: Vec<u8>, post_id: u32) -> Result<()> {
        let postbox_account = &mut ctx.accounts.postbox;
        if post_id > postbox_account.max_child_id + POSTBOX_GROW_CHILDREN_BY {
            return Err(Error::from(ProgramError::InvalidArgument).with_source(source!()));
        }
        if post_id >= postbox_account.max_child_id {
            postbox_account.max_child_id += POSTBOX_GROW_CHILDREN_BY;
        }

        let post_account = &mut ctx.accounts.post;
        post_account.poster = ctx.accounts.poster.key();
        post_account.data = data;

        let reply_to = ctx.accounts.reply_to.key();
        if reply_to != Pubkey::default() && Account::<Post>::try_from(&ctx.accounts.reply_to).is_err() {
            return Err(Error::from(ProgramError::InvalidArgument).with_source(source!()));
        }
        post_account.reply_to = if reply_to == Pubkey::default() {None} else {Some(reply_to)};

        emit!(PostEvent {
            poster_pubkey: ctx.accounts.poster.key(),
            postbox_pubkey: ctx.accounts.postbox.key(),
            post_pubkey: post_account.key(),
            post_id: post_id,
            data: post_account.data.clone(),
            reply_to: post_account.reply_to,
        });

        system_instruction::transfer(&ctx.accounts.poster.key(), &ctx.accounts.treasury.key(), FEE_POST);
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

        system_instruction::transfer(&ctx.accounts.voter.key(), &ctx.accounts.treasury.key(), FEE_VOTE);
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

    pub fn add_settings_account(ctx: Context<AddSettingsAccount>, settings_type: SettingsAccountType,
        account_data: SettingsAccountData, _account_seed: String) -> Result<()> {
        ctx.accounts.new_account.data = account_data;
        ctx.accounts.new_account.version = INIT_SETTINGS_VERSION;

        match ctx.accounts.postbox.get_settings_address(settings_type) {
            Some(_) => return Err(Error::from(ProgramError::InvalidArgument).with_source(source!())),
            None => ctx.accounts.postbox.settings_accounts.push(SettingsAddress {
                settings_type: settings_type,
                address: ctx.accounts.new_account.key(),
            }),
        }
        Ok(())
    }

    pub fn update_settings_account(ctx: Context<UpdateSettingsAccount>, settings_type: SettingsAccountType,
        account_data: SettingsAccountData, _account_seed: String, account_version: u32) -> Result<()> {
        ctx.accounts.new_account.data = account_data;
        ctx.accounts.new_account.version = account_version;

        for setting in &mut ctx.accounts.postbox.settings_accounts {
            if settings_type == setting.settings_type {
                setting.address = ctx.accounts.new_account.key();
                return Ok(());
            }
        }
        return Err(Error::from(ProgramError::InvalidArgument).with_source(source!()));
    }
}

#[derive(Accounts)]
#[instruction(target: String, owners: Vec<Pubkey>)]
pub struct Initialize<'info> {
    #[account(init,
        payer = signer,
        space = 8 + 4 + 32 + 4 + (1 + 32) * POSTBOX_INIT_SETTINGS,
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
    #[account(init,
        payer = signer,
        space = 8 + 4 + 1 + 4 + 32 * owners.len(),
        seeds = [PROTOCOL_SEED.as_bytes(), OWNER_SEED.as_bytes(), postbox.key().as_ref(), &INIT_SETTINGS_VERSION.to_le_bytes()],
        bump,
    )]
    pub owner_settings: Box<Account<'info, SettingsAccount>>,
    /// CHECK: we use this account's address only for generating the PDA
    pub target_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub signer: Signer<'info>,
    /// CHECK: we do not access the data in the fee_receiver other than to transfer lamports to it
    #[account(mut, address = treasury::TREASURY_ADDRESS)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(data: Vec<u8>, post_id: u32)]
pub struct CreatePost<'info> {
    #[account(init,
        payer = poster,
        space = 8 + 32 + 4 + data.len() + 4 + 4 + 1 + (if reply_to.key() != Pubkey::default() {32} else {0}),
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
    /// CHECK: we allow passing default or a post and verify ourself
    #[account(constraint = is_post_or_default(&reply_to))]
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
    /// CHECK: we use this account's address only for generating the PDA
    pub target_account: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [PROTOCOL_SEED.as_bytes(), MODERATOR_SEED.as_bytes(), postbox.key().as_ref()],
        bump,
    )]
    pub moderator_mint: Box<Account<'info, token::Mint>>,
    #[account(address = postbox.get_settings_address(SettingsAccountType::OwnerInfo).unwrap())]
    pub owner_settings: Box<Account<'info, SettingsAccount>>,
    #[account(mut, constraint=(owner_is_valid(&owner, &owner_settings)))]
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
#[instruction(account_type: SettingsAccountType, account_data: SettingsAccountData, account_seed: String)]
pub struct AddSettingsAccount<'info> {
    #[account(mut)]
    pub postbox: Box<Account<'info, Postbox>>,
    #[account(init,
        payer = owner,
        space = 8 + 4 + account_data.get_size(),
        seeds = [PROTOCOL_SEED.as_bytes(), account_seed.as_bytes(), postbox.key().as_ref(), &INIT_SETTINGS_VERSION.to_le_bytes()],
        constraint = (account_type.get_seed() == account_seed),
        bump,
    )]
    pub new_account: Account<'info, SettingsAccount>,
    #[account(address = postbox.get_settings_address(SettingsAccountType::OwnerInfo).unwrap())]
    pub owner_settings: Box<Account<'info, SettingsAccount>>,
    #[account(mut, constraint=(owner_is_valid(&owner, &owner_settings)))]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(account_type: SettingsAccountType, account_data: SettingsAccountData, account_seed: String, account_version: u32)]
pub struct UpdateSettingsAccount<'info> {
    #[account(mut)]
    pub postbox: Box<Account<'info, Postbox>>,
    #[account(init,
        payer = owner,
        space = 8 + 4 + account_data.get_size(),
        seeds = [PROTOCOL_SEED.as_bytes(), account_seed.as_bytes(), postbox.key().as_ref(), &account_version.to_le_bytes()],
        constraint = (account_type.get_seed() == account_seed),
        bump,
    )]
    pub new_account: Account<'info, SettingsAccount>,
    #[account(mut,
        close = owner,
        constraint=(old_account.data.is_type(account_type) && account_version == old_account.version + 1)
    )]
    pub old_account: Account<'info, SettingsAccount>,
    #[account(address = postbox.get_settings_address(SettingsAccountType::OwnerInfo).unwrap())]
    pub owner_settings: Box<Account<'info, SettingsAccount>>,
    #[account(mut, constraint=(owner_is_valid(&owner, &owner_settings)))]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn is_post_or_default(account_info: & AccountInfo) -> bool {
    return account_info.key() == Pubkey::default() || Account::<Post>::try_from(account_info).is_ok();
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Copy,
    Clone,
    PartialEq,
    Eq,
    std::fmt::Debug
)]
pub enum SettingsAccountType {
    Description,
    OwnerInfo,
    PostRestrictions,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub enum SettingsAccountData {
    Description { title: String, desc: String },
    OwnerInfo { owners: Vec<Pubkey> },
    PostRestrictions,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Copy,
    Clone,
    PartialEq,
    Eq
)]
pub struct SettingsAddress {
    pub settings_type: SettingsAccountType,
    pub address: Pubkey,
}

impl Postbox {
    pub fn get_settings_address(&self, settings_type: SettingsAccountType) -> Option<Pubkey> {
        for setting in &self.settings_accounts {
            if settings_type == setting.settings_type {
                return Some(setting.address);
            }
        }
        return None;
    }
}

impl SettingsAccountData {
    pub fn is_type(&self, account_type: SettingsAccountType) -> bool {
        return account_type == match self {
            SettingsAccountData::Description { title: _, desc: _ } => SettingsAccountType::Description,
            SettingsAccountData::OwnerInfo { owners: _ } => SettingsAccountType::OwnerInfo,
            SettingsAccountData::PostRestrictions => SettingsAccountType::PostRestrictions,
        };
    }

    pub fn get_size(&self) -> usize {
        return match self.try_to_vec() {
            Ok(v) => v.len(),
            Err(_) => 0,
        };
    }
}

impl SettingsAccountType {
    pub fn get_seed(&self) -> &'static str {
        return match self {
            SettingsAccountType::Description => DESCRIPTION_SEED,
            SettingsAccountType::OwnerInfo => OWNER_SEED,
            SettingsAccountType::PostRestrictions => POST_RESTRICTIONS_SEED,
        };
    }
}

pub fn owner_is_valid(owner: & Signer, owner_settings_account: & Box<Account<SettingsAccount>>) -> bool {
    return match & owner_settings_account.data {
        SettingsAccountData::OwnerInfo { owners } => owners.contains(&owner.key()),
        _ => false,
    };
}

#[account]
#[derive(Default)]
pub struct Postbox {
    pub max_child_id: u32,
    pub moderator_mint: Pubkey,
    pub settings_accounts: Vec<SettingsAddress>,
}

#[account]
#[derive(Default)]
pub struct Post {
    poster: Pubkey,
    data: Vec<u8>,
    up_votes: u16,
    down_votes: u16,
    reply_to: Option<Pubkey>,
    extra: Vec<u8>,
}

#[account]
pub struct SettingsAccount {
    version: u32,
    data: SettingsAccountData,
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
