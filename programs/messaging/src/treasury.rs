use anchor_lang::prelude::*;

#[cfg(feature = "devnet")]
#[constant]
pub const TREASURY_ADDRESS: Pubkey = solana_program::pubkey!("G2GGDc89qpuk21WgRUVPDY517uc6qR5yT4KX7AakyVR1");
#[cfg(not(feature = "devnet"))]
#[constant]
pub const TREASURY_ADDRESS: Pubkey = solana_program::pubkey!("G2GGDc89qpuk21WgRUVPDY517uc6qR5yT4KX7AakyVR1");
