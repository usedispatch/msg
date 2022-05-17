use anchor_lang::prelude::*;

#[cfg(feature = "mainnet")]
pub const TREASURY_ADDRESS: Pubkey = solana_program::pubkey!("5MNBoBJDHHG4pB6qtWgYPzGEncoYTLAaANovvoaxu28p");
#[cfg(not(feature = "mainnet"))]
pub const TREASURY_ADDRESS: Pubkey = solana_program::pubkey!("G2GGDc89qpuk21WgRUVPDY517uc6qR5yT4KX7AakyVR1");
