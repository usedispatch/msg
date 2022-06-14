use anchor_lang::prelude::*;
use anchor_spl::token;
use mpl_token_metadata;
use crate::errors::PostboxErrorCode;

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub enum PostRestrictionRule {
    TokenOwnership { mint: Pubkey, amount: u64 },
    NftOwnership { collection_id: Pubkey },
}

impl crate::Post {
    pub fn get_size(&self) -> usize {
        return match self.try_to_vec() {
            Ok(v) => v.len(),
            Err(_) => 0,
        };
    }

    pub fn validate_reply_allowed(&self, poster: &Pubkey, membership_token: &AccountInfo, membership_mint_meta: &AccountInfo) -> Result<()> {
        if self.post_restrictions.is_none() {
            return Ok(())
        }
        let restriction = self.post_restrictions.as_ref().unwrap();
        let token_result = Account::<token::TokenAccount>::try_from(membership_token);
        require!(token_result.is_ok(), PostboxErrorCode::NotTokenAccount);
        let token = token_result.unwrap();

        match restriction {
            PostRestrictionRule::TokenOwnership { mint, amount } => {
                require!(token.owner == *poster && token.mint == *mint && token.amount >= *amount,
                PostboxErrorCode::MissingTokenRestriction);
            },

            PostRestrictionRule::NftOwnership { collection_id } => {
                let expected_meta_key = mpl_token_metadata::pda::find_metadata_account(& token.mint).0;
                require!(membership_mint_meta.key() == expected_meta_key, PostboxErrorCode::InvalidMetadataKey);
                if let Some(mint_meta) = Account::<crate::nft_metadata::Metadata>::try_from(membership_mint_meta).ok() {
                    match &mint_meta.collection {
                        None => return Err(Error::from(PostboxErrorCode::NoCollectionOnMetadata).with_source(source!())),
                        Some(collection) => require!(collection.verified && collection.key == *collection_id,
                            PostboxErrorCode::MissingCollectionNftRestriction),
                    }
                } else {
                    return Err(Error::from(PostboxErrorCode::MetadataAccountInvalid).with_source(source!()));
                }
            },
        }

        Ok(())
    }
}
