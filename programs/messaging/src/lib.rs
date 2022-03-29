use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;
use anchor_spl::{token, associated_token};
mod treasury;

#[cfg(feature = "mainnet")]
declare_id!("BHJ4tRcogS88tUhYotPfYWDjR4q7MGdizdiguY3N54rb");
#[cfg(not(feature = "mainnet"))]
declare_id!("BHJ4tRcogS88tUhYotPfYWDjR4q7MGdizdiguY3N54rb");

#[constant]
const MESSAGE_FEE_LAMPORTS: u64 = 50000;
const PROTOCOL_SEED: & str = "dispatch";
const MAILBOX_SEED: & str = "mailbox";
const MESSAGE_SEED: & str = "message";

fn inner_send_message(mailbox: &mut Mailbox, message: &mut Message, data: String, sender: Pubkey,
                      payer: Pubkey, receiver: Pubkey, fee_receiver: Pubkey) -> Result<()> {
    mailbox.message_count += 1;
    message.sender = sender;
    message.payer = payer;
    message.data = data;
    system_instruction::transfer(&payer, &fee_receiver, MESSAGE_FEE_LAMPORTS);
    emit!(DispatchMessage {
        sender_pubkey: message.sender,
        receiver_pubkey: receiver,
        message_index: mailbox.message_count - 1,
        message: message.data.clone(),
    });
    Ok(())
}

#[program]
pub mod messaging {
    use super::*;
    /// Send a message to the receiver. Note that anyone can create a mailbox for the receiver
    /// and send messages.
    pub fn send_message(ctx: Context<SendMessage>, data: String) -> Result<()> {
        inner_send_message(
            &mut ctx.accounts.mailbox,
            &mut ctx.accounts.message,
            data,
            ctx.accounts.sender.key(),
            ctx.accounts.payer.key(),
            ctx.accounts.receiver.key(),
            ctx.accounts.fee_receiver.key()
        )?;
        Ok(())
    }

    /// Delete an arbitrary message account and send rent to the original payer. Only the
    /// sender, payer, or receiver is allowed to call this function. If the account being
    /// deleted is the first remaining message, increment the read message count pointer.
    pub fn delete_message(ctx: Context<DeleteMessage>, message_index: u32) -> Result<()> {
        let mailbox = &mut ctx.accounts.mailbox;
        if message_index == mailbox.read_message_count && mailbox.read_message_count < mailbox.message_count {
            mailbox.read_message_count += 1;
        }

        Ok(())
    }

    /// Allow the receiver to update the count of read messages in case others have deleted
    /// and a gap has formed.
    pub fn update_read_messages(ctx: Context<UpdateReadMessages>, read_messages: u32) -> Result<()> {
        let mailbox = &mut ctx.accounts.mailbox;
        mailbox.read_message_count = read_messages;

        if mailbox.read_message_count > mailbox.message_count {
            return Err(Error::from(ProgramError::InvalidArgument).with_source(source!()));
        }

        Ok(())
    }

    /// Send a message while creating an attachment
    pub fn send_message_with_incentive(ctx: Context<SendMessageWithIncentive>,  data: String, incentive_amount: u64) -> Result<()> {
        let message = &mut ctx.accounts.message;
        inner_send_message(
            &mut ctx.accounts.mailbox,
            message,
            data,
            ctx.accounts.sender.key(),
            ctx.accounts.payer.key(),
            ctx.accounts.receiver.key(),
            ctx.accounts.fee_receiver.key()
        )?;
        message.incentive_mint = ctx.accounts.incentive_mint.key();

        let transfer_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), token::Transfer {
            authority: ctx.accounts.payer.to_account_info(),
            from: ctx.accounts.payer_token_account.to_account_info(),
            to: ctx.accounts.incentive_token_account.to_account_info(),
        });
        token::transfer(transfer_ctx, incentive_amount)?;

        Ok(())
    }

    /// Allow the receiver to claim the incentive payment
    pub fn claim_incentive(ctx: Context<ClaimIncentive>, message_index: u32) -> Result<()> {
        let incentive_amount = ctx.accounts.incentive_token_account.amount;
        let mailbox_address = ctx.accounts.mailbox.key();

        let signer_seeds: &[&[&[u8]]] = &[&[
            PROTOCOL_SEED.as_bytes(),
            MESSAGE_SEED.as_bytes(),
            mailbox_address.as_ref(),
            &message_index.to_le_bytes(),
            &[*ctx.bumps.get("message").unwrap()],
        ]];

        let transfer_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), token::Transfer {
            authority: ctx.accounts.message.to_account_info(),
            from: ctx.accounts.incentive_token_account.to_account_info(),
            to: ctx.accounts.receiver_token_account.to_account_info(),
        }, signer_seeds);
        token::transfer(transfer_ctx, incentive_amount)?;

        let close_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), token::CloseAccount {
            authority: ctx.accounts.message.to_account_info(),
            account: ctx.accounts.incentive_token_account.to_account_info(),
            destination: ctx.accounts.rent_destination.to_account_info(),
        }, signer_seeds);
        token::close_account(close_ctx)?;

        emit!(IncentiveClaimed {
            sender_pubkey: ctx.accounts.message.sender,
            receiver_pubkey: ctx.accounts.receiver.key(),
            message_index: message_index,
            mint: ctx.accounts.incentive_token_account.mint,
            amount: incentive_amount,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(data: String)]
pub struct SendMessage<'info> {
    #[account(init_if_needed,
        payer = payer,
        space = 8 + 4 + 4,
        seeds = [PROTOCOL_SEED.as_bytes(), MAILBOX_SEED.as_bytes(), receiver.key().as_ref()],
        bump,
    )]
    pub mailbox: Box<Account<'info, Mailbox>>,
    /// CHECK: we do not access the data in the receiver
    pub receiver: UncheckedAccount<'info>,

    #[account(init,
        payer = payer,
        space =
            8                               // account discriminator
            + 32                            // sender pubkey
            + 32                            // payer pubkey
            + 4 + data.as_bytes().len()     // payload string
            + 32,                           // incentive pubkey
        seeds = [PROTOCOL_SEED.as_bytes(), MESSAGE_SEED.as_bytes(), mailbox.key().as_ref(), &mailbox.message_count.to_le_bytes()],
        bump,
    )]
    pub message: Box<Account<'info, Message>>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub sender: Signer<'info>,
    /// CHECK: we do not access the data in the fee_receiver other than to transfer lamports to it
    #[account(mut,
        address = treasury::TREASURY_ADDRESS,
    )]
    pub fee_receiver: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(data: String)]
pub struct SendMessageWithIncentive<'info> {
    #[account(init_if_needed,
        payer = payer,
        space = 8 + 4 + 4,
        seeds = [PROTOCOL_SEED.as_bytes(), MAILBOX_SEED.as_bytes(), receiver.key().as_ref()],
        bump,
    )]
    pub mailbox: Box<Account<'info, Mailbox>>,
    /// CHECK: we do not access the data in the receiver
    pub receiver: UncheckedAccount<'info>,

    #[account(init,
        payer = payer,
        space =
            8                               // account discriminator
            + 32                            // sender pubkey
            + 32                            // payer pubkey
            + 4 + data.as_bytes().len()     // payload string
            + 32,                           // incentive pubkey
        seeds = [PROTOCOL_SEED.as_bytes(), MESSAGE_SEED.as_bytes(), mailbox.key().as_ref(), &mailbox.message_count.to_le_bytes()],
        bump,
    )]
    pub message: Box<Account<'info, Message>>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub sender: Signer<'info>,
    /// CHECK: we do not access the data in the fee_receiver other than to transfer lamports to it
    #[account(mut,
        address = treasury::TREASURY_ADDRESS,
    )]
    pub fee_receiver: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    pub incentive_mint: Box<Account<'info, token::Mint>>,
    #[account(mut, associated_token::mint=incentive_mint, associated_token::authority=payer)]
    pub payer_token_account: Box<Account<'info, token::TokenAccount>>,
    #[account(init, payer=payer, associated_token::mint=incentive_mint, associated_token::authority=message)]
    pub incentive_token_account: Box<Account<'info, token::TokenAccount>>,

    pub token_program: Program<'info, token::Token>,
    pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(message_index: u32)]
pub struct DeleteMessage<'info> {
    #[account(mut,
        seeds = [PROTOCOL_SEED.as_bytes(), MAILBOX_SEED.as_bytes(), receiver.key().as_ref()],
        bump,
    )]
    pub mailbox: Box<Account<'info, Mailbox>>,
    /// CHECK: we only include receiver for their public key and do not access the account
    /// and verify it based on the PDA of the mailbox
    pub receiver: UncheckedAccount<'info>,

    #[account(mut,
        constraint = (authorized_deleter.key() == receiver.key() || authorized_deleter.key() == message.sender || authorized_deleter.key() == message.payer)
    )]
    pub authorized_deleter: Signer<'info>,

    #[account(mut,
        close = rent_destination,
        seeds = [PROTOCOL_SEED.as_bytes(), MESSAGE_SEED.as_bytes(), mailbox.key().as_ref(), &message_index.to_le_bytes()],
        bump,
    )]
    pub message: Box<Account<'info, Message>>,

    /// CHECK: we do not access the data in the rent_destination other than to transfer lamports to it
    #[account(mut,
        address = message.payer,
    )]
    pub rent_destination: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateReadMessages<'info> {
    #[account(mut,
        seeds = [PROTOCOL_SEED.as_bytes(), MAILBOX_SEED.as_bytes(), receiver.key().as_ref()],
        bump,
    )]
    pub mailbox: Box<Account<'info, Mailbox>>,
    pub receiver: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(message_index: u32)]
pub struct ClaimIncentive<'info> {
    #[account(mut,
        seeds = [PROTOCOL_SEED.as_bytes(), MAILBOX_SEED.as_bytes(), receiver.key().as_ref()],
        bump,
    )]
    pub mailbox: Box<Account<'info, Mailbox>>,
    #[account(mut)]
    pub receiver: Signer<'info>,

    #[account(mut,
        close = rent_destination,
        seeds = [PROTOCOL_SEED.as_bytes(), MESSAGE_SEED.as_bytes(), mailbox.key().as_ref(), &message_index.to_le_bytes()],
        bump,
    )]
    pub message: Box<Account<'info, Message>>,

    /// CHECK: we do not access the data in the rent_destination other than to transfer lamports to it
    #[account(mut,
        address = message.payer,
    )]
    pub rent_destination: UncheckedAccount<'info>,

    #[account(address=message.incentive_mint)]
    pub incentive_mint: Box<Account<'info, token::Mint>>,
    #[account(mut, associated_token::mint=incentive_mint, associated_token::authority=message)]
    pub incentive_token_account: Box<Account<'info, token::TokenAccount>>,
    #[account(init_if_needed, payer=receiver, associated_token::mint=incentive_mint, associated_token::authority=receiver)]
    pub receiver_token_account: Box<Account<'info, token::TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
#[derive(Default)]
pub struct Mailbox {
    pub read_message_count: u32,
    pub message_count: u32,
}

#[account]
#[derive(Default)]
pub struct Message {
    pub sender: Pubkey,
    pub payer: Pubkey,
    pub data: String,
    pub incentive_mint: Pubkey,
}

#[event]
pub struct DispatchMessage {
    pub sender_pubkey: Pubkey,
    pub receiver_pubkey: Pubkey,
    pub message_index: u32,
    pub message: String,
}

#[event]
pub struct IncentiveClaimed {
    pub sender_pubkey: Pubkey,
    pub receiver_pubkey: Pubkey,
    pub message_index: u32,
    pub mint: Pubkey,
    pub amount: u64,
}
