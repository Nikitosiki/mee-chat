import { TRPCError } from "@trpc/server";
import ably, { publish } from "../ably";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { contentSchema } from "shared/schema/chat";
import { getLastRead, setLastRead } from "../redis/last-read";
import db from "db/client";
import { directMessageInfos, groups, messages, User, users } from "db/schema";
import { and, eq } from "drizzle-orm";
import { generateText } from "../eden";
import { onReceiveMessage } from "../inworld";
import { checkChannelPermissions, getMembership } from "../utils/permissions";
import { pick } from "shared/common";
import {
  ComplexMessage,
  createMessage,
  fetchMessages,
  getEmbeds,
  messageSchema,
} from "../utils/messages";
import { schema } from "../ably/schema";

const userProfileKeys = ["id", "name", "image"] as const;

export type UserProfile = Pick<User, (typeof userProfileKeys)[number]>;

export const chatRouter = router({
  send: protectedProcedure
    .input(messageSchema)
    .mutation(async ({ input, ctx }) => {
      const { type, data } = await checkChannelPermissions(
        input.channelId,
        ctx.session.user.id,
      );

      const [message, isDMOpened] = await Promise.all([
        createMessage(input, ctx.session.user.id),
        (() => {
          if (type !== "dm") return false;

          return db
            .update(directMessageInfos)
            .set({
              open: true,
            })
            .where(
              and(
                eq(directMessageInfos.channel_id, input.channelId),
                eq(directMessageInfos.open, false),
              ),
            )
            .then((res) => {
              return res.rowCount !== 0;
            });
        })(),
      ]);

      await Promise.all([
        type === "dm" &&
          isDMOpened &&
          publish("private", [data.to_user_id], {
            type: "open_dm",
            data: {
              id: data.channel_id,
              user: message.author!,
              unread_messages: 0,
              last_message: { content: message.content },
            },
          }),
        publish("chat", [input.channelId], {
          type: "message_sent",
          data: {
            ...message,
            nonce: input.nonce,
          },
        }),

        setLastRead(input.channelId, ctx.session.user.id, message.timestamp),
        input.content.startsWith("@Mee") &&
          onReceiveMessage({
            content: input.content,
            channel_id: input.channelId,
            user_name: message.author!.name,
          }),
      ]);

      return message;
    }),
  messages: protectedProcedure
    .input(
      z.object({
        channelId: z.string(),
        count: z.number().min(0).max(50).default(50),
        after: z.number().optional(),
        before: z.number().optional(),
      }),
    )
    .query<ComplexMessage[]>(async ({ input, ctx }) => {
      await checkChannelPermissions(input.channelId, ctx.session.user.id);

      return fetchMessages(
        input.channelId,
        input.count,
        input.after ? new Date(input.after) : undefined,
        input.before ? new Date(input.before) : undefined,
      );
    }),
  update: protectedProcedure
    .input(
      z.object({
        messageId: z.number(),
        channelId: z.string(),
        // todo: Support when message contains embed/attachment
        content: contentSchema.min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const embeds = await getEmbeds(input.content);

      const rows = await db
        .update(messages)
        .set({
          content: input.content,
          embeds,
        })
        .where(
          and(
            eq(messages.id, input.messageId),
            eq(messages.author_id, ctx.session.user.id),
            eq(messages.channel_id, input.channelId),
          ),
        );

      if (rows.rowCount === 0)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No permission or message doesn't exist",
        });

      await publish("chat", [input.channelId], {
        type: "message_updated",
        data: {
          id: input.messageId,
          content: input.content,
          embeds,
          channel_id: input.channelId,
        },
      });
    }),
  delete: protectedProcedure
    .input(
      z.object({
        messageId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const message = await db
        .select({
          authorId: messages.author_id,
          channelId: messages.channel_id,
          groupId: groups.id,
        })
        .from(messages)
        .where(eq(messages.id, input.messageId))
        .leftJoin(groups, eq(groups.channel_id, messages.channel_id))
        .limit(1)
        .then((res) => res[0]);

      if (message == null)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Message not found",
        });

      const member = message.groupId
        ? await getMembership(message.groupId, ctx.session.user.id)
        : undefined;

      if (
        message.authorId !== ctx.session.user.id &&
        (!member || (!member.admin && !member.owner))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Missing required permission",
        });
      }

      await db.delete(messages).where(eq(messages.id, input.messageId));
      await publish("chat", [message.channelId], {
        type: "message_deleted",
        data: {
          id: input.messageId,
          channel_id: message.channelId,
        },
      });
    }),
  read: protectedProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await setLastRead(
        input.channelId,
        ctx.session.user.id,
        new Date(Date.now()),
      );
    }),
  checkout: protectedProcedure
    .input(
      z.object({
        channelId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const old = await getLastRead(input.channelId, ctx.session.user.id);

      await setLastRead(
        input.channelId,
        ctx.session.user.id,
        new Date(Date.now()),
      );

      return { last_read: old };
    }),
  type: protectedProcedure
    .input(
      z.object({
        channelId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db
        .select(pick(users, ...userProfileKeys))
        .from(users)
        .where(eq(users.id, ctx.session.user.id))
        .then((res) => res[0]);

      if (user == null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User not found",
        });

      await publish("chat", [input.channelId], {
        type: "typing",
        data: { user, channelId: input.channelId },
      });
    }),
  generateText: protectedProcedure
    .input(z.object({ text: z.string().trim().min(0) }))
    .mutation(async ({ input }) => {
      return {
        text: await generateText(input.text),
      };
    }),
  status: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
      }),
    )
    .query<"online" | "offline">(async ({ input }) => {
      const info = await ably.channels
        .get(schema.private.name(input.userId))
        .presence.get({
          limit: 1,
          clientId: input.userId,
        });
      const item = info.items[0];

      if (item && ["present", "enter"].includes(item.action)) return "online";

      return "offline";
    }),
});
