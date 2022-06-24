use anchor_lang::prelude::*;

#[cfg(feature = "mainnet")]
pub const TREASURY_ADDRESS: Pubkey = solana_program::pubkey!("5MNBoBJDHHG4pB6qtWgYPzGEncoYTLAaANovvoaxu28p");
#[cfg(not(feature = "mainnet"))]
pub const TREASURY_ADDRESS: Pubkey = solana_program::pubkey!("G2GGDc89qpuk21WgRUVPDY517uc6qR5yT4KX7AakyVR1");

pub fn transfer_lamports<'info>(from: &dyn ToAccountInfo<'info>, to: &dyn ToAccountInfo<'info>, lamports: u64) -> Result<()> {
    let from_info = from.to_account_info();
    let to_info = to.to_account_info();
    solana_program::program::invoke(
        &solana_program::system_instruction::transfer(from_info.key, to_info.key, lamports),
        &[from_info, to_info],
    )?;
    Ok(())
}
