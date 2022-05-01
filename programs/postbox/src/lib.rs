use anchor_lang::prelude::*;
use anchor_spl::{token};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const PROTOCOL_SEED: & str = "dispatch";
const POSTBOX_SEED: & str = "postbox";
const POST_SEED: & str = "post";

const POSTBOX_INIT_SETTINGS: usize = 3;
const POSTBOX_GROW_CHILDREN_BY: u32 = 5;
const POSTBOX_MAX_GROW_CHILDREN_BY: u32 = 50;

// initialize postbox
// create post
// delete by owner
// delete by moderator
// issue moderator token

#[program]
pub mod postbox {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let postbox_account = &mut ctx.accounts.postbox;
        postbox_account.max_child_id = 0;
        postbox_account.moderator_mint = ctx.accounts.moderator_mint.key();
        postbox_account.settings_accounts = Vec::with_capacity(POSTBOX_INIT_SETTINGS);
        Ok(())
    }

    pub fn create_post(ctx: Context<CreatePost>, data: String, _post_id: u32) -> Result<()> {
        let postbox_account = &mut ctx.accounts.postbox;
        if _post_id > postbox_account.max_child_id + POSTBOX_MAX_GROW_CHILDREN_BY {
            return Err(Error::from(ProgramError::InvalidArgument).with_source(source!()));
        }
        if _post_id > postbox_account.max_child_id {
            postbox_account.max_child_id = _post_id.max(postbox_account.max_child_id + POSTBOX_GROW_CHILDREN_BY);
        }

        let post_account = &mut ctx.accounts.post;
        post_account.poster = ctx.accounts.poster.key();
        post_account.data = data;

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
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init,
        payer = owner,
        space = 8 + 4 + 32 + (2 + 32) * POSTBOX_INIT_SETTINGS,  // TODO(mfasman): do we need any space for the vec itself?
        seeds = [PROTOCOL_SEED.as_bytes(), POSTBOX_SEED.as_bytes(), owner.key().as_ref()],
        bump,
    )]
    pub postbox: Box<Account<'info, Postbox>>,
    #[account(init,
        payer = owner,
        space = token::Mint::LEN,
        seeds = [],
        bump,
    )]
    pub moderator_mint: Box<Account<'info, token::Mint>>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(data: String, post_id: u32)]
pub struct CreatePost<'info> {
    #[account(init,
        payer = poster,
        space = 8 + 32 + data.as_bytes().len(),
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
        bump
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
    settings_type: SettingsAccountType,
    address: Pubkey,
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
    data: String,
}

#[event]
pub struct PostboxMessage {
    pub poster_pubkey: Pubkey,
    pub postbox_pubkey: Pubkey,
    pub message_id: u32,
    pub message: String,
}
