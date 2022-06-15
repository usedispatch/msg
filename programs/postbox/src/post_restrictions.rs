use anchor_lang::prelude::*;
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

    pub fn validate_reply_allowed(&self,
        poster: &Pubkey,
        membership_token: &AccountInfo,
        membership_mint_meta: &AccountInfo,
        membership_collection: &AccountInfo,
    ) -> Result<()> {
        if self.post_restrictions.is_none() {
            return Ok(())
        }
        let restriction = self.post_restrictions.as_ref().unwrap();
        let token = Account::<anchor_spl::token::TokenAccount>::try_from(membership_token)?;

        match restriction {
            PostRestrictionRule::TokenOwnership { mint, amount } => {
                require!(token.owner == *poster && token.mint == *mint && token.amount >= *amount,
                PostboxErrorCode::MissingTokenRestriction);
            },

            PostRestrictionRule::NftOwnership { collection_id } => {
                let expected_meta_key = mpl_token_metadata::pda::find_metadata_account(& token.mint).0;
                require!(membership_mint_meta.key() == expected_meta_key, PostboxErrorCode::InvalidMetadataKey);
                let mint_meta = Account::<crate::nft_metadata::Metadata>::try_from(membership_mint_meta)?;
                require!(mint_meta.collection.is_some(), PostboxErrorCode::NoCollectionOnMetadata);
                let collection = mint_meta.collection.as_ref().unwrap();
                let has_collection_nft = token.owner == *poster
                    && collection.verified
                    && collection.key == *collection_id
                    && collection.key == membership_collection.key()
                    && *membership_collection.owner == anchor_spl::token::ID;
                require!(has_collection_nft, PostboxErrorCode::MissingCollectionNftRestriction);
            },
        }

        Ok(())
    }
}
