use anchor_lang::prelude::*;
use anchor_spl::{token, associated_token};

declare_id!("Fs5wSa7GYtTqivXGqHyx673v5oPuD5Cb7ij9utsFKdLb");

const PROTOCOL_SEED: & str = "dispatch";
const POSTBOX_SEED: & str = "postbox";
const POST_SEED: & str = "post";
const MODERATOR_SEED: & str = "moderator";
const OWNER_SEED: & str = "owners";

const POSTBOX_INIT_SETTINGS: usize = 3;
#[constant]
const POSTBOX_GROW_CHILDREN_BY: u32 = 1;

// Features to support:
// --------------------
// initialize postbox (done)
// create post (done)
// delete by poster (done)
// delete by moderator (done)
// issue moderator token (done)
// vote

// TODO(mfasman): charge a fee
// TODO(mfasman): should we put reply data on chain?

#[program]
pub mod postbox {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, subject: String, owners: Vec<Pubkey>) -> Result<()> {
        if 0 == owners.len() || !owners.contains(&ctx.accounts.signer.key()) {
            return Err(Error::from(ProgramError::InvalidArgument).with_source(source!()));
        }
        if 0 == subject.len() && ctx.accounts.subject_account.key() != ctx.accounts.signer.key() {
            return Err(Error::from(ProgramError::InvalidArgument).with_values(("Subject string must have a value", subject)));
        }

        let owner_settings_account = &mut ctx.accounts.owner_settings;
        owner_settings_account.owners = owners;

        let postbox_account = &mut ctx.accounts.postbox;
        postbox_account.max_child_id = 0;
        postbox_account.moderator_mint = ctx.accounts.moderator_mint.key();
        postbox_account.settings_accounts = vec!(
            SettingsAddress {
                settings_type: SettingsAccountType::OwnerInfo,
                address: owner_settings_account.key(),
            },
        );

        Ok(())
    }

    pub fn create_post(ctx: Context<CreatePost>, data: Vec<u8>, post_id: u32) -> Result<()> {
        let postbox_account = &mut ctx.accounts.postbox;
        if post_id > postbox_account.max_child_id {
            return Err(Error::from(ProgramError::InvalidArgument).with_source(source!()));
        }
        if post_id == postbox_account.max_child_id {
            postbox_account.max_child_id = postbox_account.max_child_id + POSTBOX_GROW_CHILDREN_BY;
        }

        let post_account = &mut ctx.accounts.post;
        post_account.poster = ctx.accounts.poster.key();
        post_account.data = data;

        emit!(PostEvent {
            poster_pubkey: ctx.accounts.poster.key(),
            postbox_pubkey: ctx.accounts.postbox.key(),
            post_id: post_id,
            data: post_account.data.clone(),
        });

        Ok(())
    }

    pub fn delete_own_post(_ctx: Context<DeleteOwnPost>) -> Result<()> {
        Ok(())
    }

    pub fn delete_post_by_moderator(ctx: Context<DeletePostByModerator>) -> Result<()> {
        if 0 == ctx.accounts.moderator_token_ata.amount {
            return Err(Error::from(ProgramError::InsufficientFunds).with_source(source!()));
        }
        Ok(())
    }

    pub fn designate_moderator(ctx: Context<DesignateModerator>) -> Result<()> {
        let postbox_address = ctx.accounts.postbox.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            PROTOCOL_SEED.as_bytes(),
            MODERATOR_SEED.as_bytes(),
            postbox_address.as_ref(),
            &[*ctx.bumps.get("moderator_mint").unwrap()],
        ]];

        let mint_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), token::MintTo {
            mint: ctx.accounts.moderator_mint.to_account_info(),
            authority: ctx.accounts.postbox.to_account_info(),
            to: ctx.accounts.new_moderator.to_account_info(),
        }, signer_seeds);
        token::mint_to(mint_ctx, 1)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(subject: String, owners: Vec<Pubkey>)]
pub struct Initialize<'info> {
    #[account(init,
        payer = signer,
        space = 8 + 4 + 32 + 4 + (1 + 32) * POSTBOX_INIT_SETTINGS,
        seeds = [PROTOCOL_SEED.as_bytes(), POSTBOX_SEED.as_bytes(), subject_account.key().as_ref(), subject.as_bytes()],
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
        space = 8 + 4 + 32 * owners.len(),
        seeds = [PROTOCOL_SEED.as_bytes(), OWNER_SEED.as_bytes(), postbox.key().as_ref()],
        bump,
    )]
    pub owner_settings: Box<Account<'info, OwnerSettingsAccount>>,
    /// CHECK: we use this account's address only for generating the PDA
    pub subject_account: UncheckedAccount<'info>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(data: Vec<u8>, post_id: u32)]
pub struct CreatePost<'info> {
    #[account(init,
        payer = poster,
        space = 8 + 32 + 4 + data.len() + 4 + 4,
        seeds = [PROTOCOL_SEED.as_bytes(), POST_SEED.as_bytes(), postbox.key().as_ref(), &post_id.to_le_bytes()],
        bump,
    )]
    pub post: Box<Account<'info, Post>>,
    #[account(mut)]
    pub postbox: Box<Account<'info, Postbox>>,
    #[account(mut)]
    pub poster: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeleteOwnPost<'info> {
    #[account(mut, close=poster, has_one=poster)]
    pub post: Box<Account<'info, Post>>,
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
    #[account(associated_token::mint=postbox.moderator_mint, associated_token::authority=moderator)]
    pub moderator_token_ata: Account<'info, token::TokenAccount>,
}

#[derive(Accounts)]
pub struct DesignateModerator<'info> {
    #[account(has_one = moderator_mint)]
    pub postbox: Box<Account<'info, Postbox>>,
    #[account(
        seeds = [PROTOCOL_SEED.as_bytes(), MODERATOR_SEED.as_bytes(), postbox.key().as_ref()],
        bump,
    )]
    pub moderator_mint: Box<Account<'info, token::Mint>>,
    #[account(address = get_settings_address(&postbox.settings_accounts, SettingsAccountType::OwnerInfo).unwrap())]
    pub owner_settings: Box<Account<'info, OwnerSettingsAccount>>,
    #[account(mut)]
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

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Copy,
    Clone,
    PartialEq,
    Eq
)]
pub enum SettingsAccountType {
    Description,
    OwnerInfo,
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

pub fn get_settings_address(settings: &Vec<SettingsAddress>, settings_type: SettingsAccountType) -> Option<Pubkey> {
    for setting in settings {
        if settings_type == setting.settings_type {
            return Some(setting.address);
        }
    }
    return None;
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
    extra: Vec<u8>,
}

#[account]
#[derive(Default)]
pub struct OwnerSettingsAccount {
    owners: Vec<Pubkey>,
}

#[event]
pub struct PostEvent {
    pub poster_pubkey: Pubkey,
    pub postbox_pubkey: Pubkey,
    pub post_id: u32,
    pub data: Vec<u8>,
}
