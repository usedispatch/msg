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
pub struct QuantifiedMint {
    mint: Pubkey,
    amount: u64,
}

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
    Null,
    NftListAnyOwnership { collection_ids: Vec<Pubkey> },
    TokenOrNftAnyOwnership { mints: Vec<QuantifiedMint>, collection_ids: Vec<Pubkey> },
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    PartialEq,
    Eq
)]
pub enum AdditionalAccountIndices {
    TokenOwnership { token_idx: u8 },
    NftOwnership { token_idx: u8, meta_idx: u8, collection_idx: u8 },
    Null,
}

impl PostRestrictionRule {
    pub fn get_size(&self) -> usize {
        return match self.try_to_vec() {
            Ok(v) => v.len(),
            Err(_) => 0,
        };
    }

    fn validate_nft_ownership(&self,
        poster: &Pubkey,
        extra_accounts: &[AccountInfo],
        account_indices_vec: &Vec<AdditionalAccountIndices>,
        collection_id: &Pubkey,
    ) -> Result<()> {
        let mut checked: bool = false;
        for account_indices in account_indices_vec {
            if let AdditionalAccountIndices::NftOwnership { token_idx, meta_idx, collection_idx } = account_indices {
                let membership_token = &extra_accounts[usize::from(*token_idx)];
                let membership_mint_meta = &extra_accounts[usize::from(*meta_idx)];
                let membership_collection = &extra_accounts[usize::from(*collection_idx)];
                let token = Account::<anchor_spl::token::TokenAccount>::try_from(membership_token).map_err(
                    |_| Error::from(PostboxErrorCode::InvalidRestrictionExtraAccounts).with_source(source!())
                )?;
                let expected_meta_key = mpl_token_metadata::pda::find_metadata_account(& token.mint).0;
                require!(membership_mint_meta.key() == expected_meta_key, PostboxErrorCode::InvalidMetadataKey);
                let mint_meta = Account::<crate::nft_metadata::Metadata>::try_from(membership_mint_meta).map_err(
                    |_| Error::from(PostboxErrorCode::InvalidRestrictionExtraAccounts).with_source(source!())
                )?;
                require!(mint_meta.collection.is_some(), PostboxErrorCode::NoCollectionOnMetadata);
                let collection = mint_meta.collection.as_ref().unwrap();
                let has_collection_nft = token.owner == *poster
                    && token.amount == 1
                    && collection.verified
                    && collection.key == *collection_id
                    && collection.key == membership_collection.key()
                    && *membership_collection.owner == anchor_spl::token::ID;
                require!(has_collection_nft, PostboxErrorCode::MissingCollectionNftRestriction);
                checked = true;
            }
        }
        require!(checked, PostboxErrorCode::MissingRequiredOffsets);
        Ok(())
    }

    fn validate_token_ownership(&self,
        poster: &Pubkey,
        extra_accounts: &[AccountInfo],
        account_indices_vec: &Vec<AdditionalAccountIndices>,
        mint: &Pubkey,
        amount: &u64,
    ) -> Result<()> {
        let mut checked: bool = false;
        for account_indices in account_indices_vec {
            if let AdditionalAccountIndices::TokenOwnership { token_idx } = account_indices {
                let membership_token = &extra_accounts[usize::from(*token_idx)];
                let token = Account::<anchor_spl::token::TokenAccount>::try_from(membership_token).map_err(
                    |_| Error::from(PostboxErrorCode::InvalidRestrictionExtraAccounts).with_source(source!())
                )?;
                let has_token = token.owner == *poster && token.mint == *mint && token.amount >= *amount;
                require!(has_token, PostboxErrorCode::MissingTokenRestriction);
                checked = true;
            }
        }
        require!(checked, PostboxErrorCode::MissingRequiredOffsets);
        Ok(())
    }

    pub fn validate_reply_allowed(&self,
        poster: &Pubkey,
        extra_accounts: &[AccountInfo],
        account_indices_vec: &Vec<AdditionalAccountIndices>,
    ) -> Result<()> {
        match self {
            PostRestrictionRule::TokenOwnership { mint, amount } => {
                self.validate_token_ownership(poster, extra_accounts, account_indices_vec, &mint, &amount)?;
            },

            PostRestrictionRule::NftOwnership { collection_id } => {
                self.validate_nft_ownership(poster, extra_accounts, account_indices_vec, &collection_id)?;
            },

            PostRestrictionRule::Null => {},

            PostRestrictionRule::NftListAnyOwnership { collection_ids } => {
                let valid = collection_ids.iter().map(|collection_id| self.validate_nft_ownership(
                    poster, extra_accounts, account_indices_vec, &collection_id
                )).any(|r| r.is_ok());
                require!(valid, PostboxErrorCode::MissingCollectionNftRestriction);
            },

            PostRestrictionRule::TokenOrNftAnyOwnership { mints, collection_ids } => {
                let token_valid = mints.iter().map(|qmint| self.validate_token_ownership(
                    poster, extra_accounts, account_indices_vec, &qmint.mint, &qmint.amount
                )).any(|r| r.is_ok());
                let nft_valid = collection_ids.iter().map(|collection_id| self.validate_nft_ownership(
                    poster, extra_accounts, account_indices_vec, &collection_id
                )).any(|r| r.is_ok());
                require!(token_valid || nft_valid, PostboxErrorCode::MissingCredentials);
            },
        }

        Ok(())
    }
}
