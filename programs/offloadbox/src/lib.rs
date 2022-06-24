use anchor_lang::prelude::*;
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

    pub fn initialize(ctx: Context<Initialize>, param: u32) -> Result<()> {
        let fee = FEE_NEW_OFFLOADBOX;
        let offloadbox = &mut ctx.accounts.offloadbox;
        offloadbox.prop = param;

        //
        // TODO set properties of the account here
        //

        treasury::transfer_lamports(&ctx.accounts.signer, &ctx.accounts.treasury, fee)?;
        Ok(())
    }
}

// TODO check permissions here
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init,
              payer = signer,
              space = 256,
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

#[account]
#[derive(Default)]
pub struct Offloadbox {
    pub prop: u32,
}
