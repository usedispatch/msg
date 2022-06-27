use anchor_lang::prelude::*;
use std::mem;
mod treasury;

#[cfg(feature = "mainnet")]
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
#[cfg(not(feature = "mainnet"))]
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const PROTOCOL_SEED: & str = "dispatch";
const OFFLOADBOX_SEED: & str = "offloadbox";
const POST_SEED: & str = "post";
const MODERATOR_SEED: & str = "moderator";

#[constant]
const FEE_NEW_OFFLOADBOX: u64 = 1_000_000_000;

#[program]
pub mod offloadbox {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let fee = FEE_NEW_OFFLOADBOX;
        let offloadbox = &mut ctx.accounts.offloadbox;
        offloadbox.addresses = vec![];

        //
        // TODO set properties of the account here
        //

        treasury::transfer_lamports(&ctx.accounts.signer, &ctx.accounts.treasury, fee)?;
        Ok(())
    }

    pub fn make_post(ctx: Context<MakePost>, address: ArweaveAddress) -> Result<()> {
        let account = &mut ctx.accounts.offloadbox;
        account.addresses.push(address);
        Ok(())
    }
}

// TODO check permissions for all these accounts
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init,
              payer = signer,
              space = mem::size_of::<ArweaveAddress>() * 100,
              seeds = [PROTOCOL_SEED.as_bytes(), OFFLOADBOX_SEED.as_bytes()],
              bump,
             )]
    pub offloadbox: Box<Account<'info, Offloadbox>>,
    #[account(mut)]
    pub signer: Signer<'info>,
    /// CHECK: we do not access the data in the fee_receiver other than to transfer lamports to it
    #[account(mut, address = treasury::TREASURY_ADDRESS)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MakePost<'info> {
    #[account(mut)]
    pub offloadbox: Box<Account<'info, Offloadbox>>
}

pub type ArweaveAddress = [u8; 32];

/// This datastructure is an account referencing data that has been offloaded to the Bundlr/Arweave
/// network. Essentially, it is a vector of addresses that can be dereferenced using
/// https://arweave.net/{address} to pull content. Post data, including content, data, and what the
/// post is in reply to, is stored on arweave.
#[account]
#[derive(Default)]
pub struct Offloadbox {
    // TODO make this a vector of 32-byte buffers to support the Arweave key format
    // See https://docs.arweave.org/developers/server/http-api#key-format
    pub addresses: Vec<ArweaveAddress>,
}
