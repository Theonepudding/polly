import { NextAuthOptions } from 'next-auth'
import DiscordProvider from 'next-auth/providers/discord'
import { isBotAdmin } from './bot-admin'

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId:     process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: { params: { scope: 'identify email guilds' } },
      // Override token/userinfo to use Web fetch (required for Cloudflare Workers)
      token: {
        url: 'https://discord.com/api/oauth2/token',
        async request(ctx) {
          const res = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id:     ctx.provider.clientId!,
              client_secret: ctx.provider.clientSecret!,
              code:          String(ctx.params.code),
              grant_type:    'authorization_code',
              redirect_uri:  ctx.provider.callbackUrl,
            }),
          })
          return { tokens: await res.json() }
        },
      },
      userinfo: {
        url: 'https://discord.com/api/users/@me',
        async request(ctx) {
          const res = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${ctx.tokens.access_token}` },
          })
          return res.json()
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider === 'discord') {
        token.discordAccessToken = account.access_token
      }

      // Check bot admin status once per sign-in (re-checked every 15 min)
      const lastCheck = (token.adminCheckedAt as number | undefined) ?? 0
      if (account || Date.now() - lastCheck > 15 * 60 * 1000) {
        if (token.sub) {
          token.isBotAdmin = await isBotAdmin(token.sub)
        }
        token.adminCheckedAt = Date.now()
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as Record<string, unknown>).id          = token.sub ?? ''
        ;(session.user as Record<string, unknown>).isBotAdmin  = token.isBotAdmin ?? false
        ;(session.user as Record<string, unknown>).discordAccessToken = token.discordAccessToken
      }
      return session
    },
  },
  pages:   { signIn: '/', error: '/?auth_error=1' },
  session: { strategy: 'jwt' },
  secret:  process.env.NEXTAUTH_SECRET,
  // No __Secure- prefix — Cloudflare Workers workaround
  cookies: {
    sessionToken: {
      name:    'next-auth.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
    },
    callbackUrl: {
      name:    'next-auth.callback-url',
      options: { sameSite: 'lax', path: '/', secure: true },
    },
    csrfToken: {
      name:    'next-auth.csrf-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
    },
    state: {
      name:    'next-auth.state',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 900 },
    },
  },
}
