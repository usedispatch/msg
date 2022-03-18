use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;
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

#[program]
pub mod messaging {
    use super::*;
    /// Send a message to the receiver. Note that anyone can create a mailbox for the receiver
    /// and send messages.
    pub fn send_message(ctx: Context<SendMessage>, data: String) -> Result<()> {
        let mailbox = &mut ctx.accounts.mailbox;
        mailbox.message_count = mailbox.message_count + 1;

        let message = &mut ctx.accounts.message;
        message.sender = ctx.accounts.sender.key().clone();
        message.payer = ctx.accounts.payer.key().clone();
        message.data = data;

        system_instruction::transfer(ctx.accounts.payer.key, ctx.accounts.fee_receiver.key, MESSAGE_FEE_LAMPORTS);

        emit!(DispatchMessage {
            sender_pubkey: message.sender,
            receiver_pubkey: ctx.accounts.receiver.key(),
            message_index: mailbox.message_count - 1,
            message: message.data.clone(),
        });

        Ok(())
    }

    /// Delete an arbitrary message account and send rent to the original payer. Only the
    /// sender, payer, or receiver is allowed to call this function. If the account being
    /// deleted is the next message, increment the read message count pointer.
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
}

#[derive(Accounts)]
#[instruction(data: String)]
pub struct SendMessage<'info> {
    #[account(init_if_needed,
        payer = payer,
        seeds = [PROTOCOL_SEED.as_bytes(), MAILBOX_SEED.as_bytes(), receiver.key().as_ref()],
        bump,
    )]
    pub mailbox: Account<'info, Mailbox>,
    /// CHECK: we do not access the data in the receiver
    pub receiver: UncheckedAccount<'info>,

    #[account(init,
        payer = payer,
        space =
            8                               // account discriminator
            + 32                            // sender pubkey
            + 32                            // payer pubkey
            + 4 + data.as_bytes().len(),    // payload string
        seeds = [PROTOCOL_SEED.as_bytes(), MESSAGE_SEED.as_bytes(), mailbox.key().as_ref(), &mailbox.message_count.to_le_bytes()],
        bump,
    )]
    pub message: Account<'info, Message>,

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
#[instruction(message_index: u32)]
pub struct DeleteMessage<'info> {
    #[account(mut,
        seeds = [PROTOCOL_SEED.as_bytes(), MAILBOX_SEED.as_bytes(), receiver.key().as_ref()],
        bump,
    )]
    pub mailbox: Account<'info, Mailbox>,
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
    pub message: Account<'info, Message>,

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
    pub mailbox: Account<'info, Mailbox>,
    pub receiver: Signer<'info>,
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
}

#[event]
pub struct DispatchMessage {
    pub sender_pubkey: Pubkey,
    pub receiver_pubkey: Pubkey,
    pub message_index: u32,
    pub message: String,
}
