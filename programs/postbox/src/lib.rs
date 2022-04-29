use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// initialize postbox
// create post
// delete post
// create reply

#[program]
pub mod postbox {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

enum SettingsAccountType {
    Description,
    OwnerInfo,
    PostRestrictions,
}

pub struct SettingsAddress {
    settings_type: ,
    address: Pubkey,
}

#[account]
#[derive(Default)]
pub struct Postbox {
    pub max_child_id: u32,
    pub moderator_mint: Pubkey,
    pub settings_accounts: std::Vec<SettingsAddress>,
}

#[account]
#[#[derive(Default)]]
pub struct Post {
    poster: Pubkey,
    data: String,
    max_child_id: u32,
    pub settings_accounts: std::Vec<SettingsAddress>,
}

#[event]
pub struct DispatchMessage {
    pub sender_pubkey: Pubkey,
    pub receiver_pubkey: Pubkey,
    pub message_index: u32,
    pub message: String,
}
