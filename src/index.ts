import * as Sentry from "@sentry/node"
import * as Tracing from "@sentry/tracing"
import { ApolloServer } from "apollo-server-express"
import argon from "argon2"
import cors from "cors"
import "dotenv-safe/config"
import express, { Request, Response } from "express"
import session from "express-session"
import { createClient } from "redis"
import { AuthChecker, buildSchema } from "type-graphql"

import { NestFactory } from "@nestjs/core"

import { ContextType } from "@nestjs/common"
import { AppModule } from "./app.module"
import { __prod__ } from "./constants"
import { AppDataSource } from "./utils/db"

import { AthleteResolver } from "./resolvers/Athlete"
import { GameResolver } from "./resolvers/Game"
import { UserResolver } from "./resolvers/User"
import { TeamResolver} from "./resolvers/Team"
import { TimeframeResolver } from "./resolvers/Timeframe"
import { ScheduleResolver } from './resolvers/Schedule'
import { CricketAthleteResolver } from './resolvers/CricketAthlete'
import { AdminWallet } from "./entities/AdminWallet"

export type IContext = {
  req: Request<any> & { session: any }
  res: Response
}

const main = async () => {
  try {
    await AppDataSource.initialize()
  } catch (err) {
    console.log(err)
  }

  // EXPRESS
  const app = express()
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [new Sentry.Integrations.Http({ tracing: true }), new Tracing.Integrations.Express({ app })],
    tracesSampleRate: 1.0,
  })
  const whitelist = [
    "http://localhost:3000",
    "https://studio.apollographql.com",
    "https://dev.app.playible.io",
    "https://app.playible.io",
  ]
  const corsOptions = {
    origin: function (origin: any, callback: any) {
      if (whitelist.indexOf(origin) !== -1) {
        callback(null, true)
      } else {
        callback()
      }
    },
    credentials: true,
  }
  app.use(cors(corsOptions))
  app.use(Sentry.Handlers.requestHandler())
  app.use(Sentry.Handlers.tracingHandler())

  // REDIS
  let RedisStore = require("connect-redis")(session)
  const redisClient = createClient({
    url: process.env.REDIS_URL,
    legacyMode: true,
  })
  redisClient.connect().catch(console.error)

  app.use(
    session({
      name: "qid",
      store: new RedisStore({
        client: redisClient,
        disableTouch: true,
      }),
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 Years
        httpOnly: true,
        sameSite: "lax", // csrf
        secure: !__prod__, // cookie only works in http
      },
      saveUninitialized: false,
      secret: process.env.SESSION_SECRET ? process.env.SESSION_SECRET : "",
      resave: false,
    })
  )

  const authChecker: AuthChecker<ContextType> = async ({ context }: { context: any }, roles) => {
    try {
      const token = context.req.headers.authorization.substring("Bearer ".length)

      if (token.length && roles.includes("ADMIN")) {
        const admins = await AdminWallet.find()

        for (let admin of admins) {
          if (await argon.verify(admin.address, token)) {
            return true
          }
        }
      }
    } catch (_) {}

    return false
  }

  // APOLLO
  const apolloServer = new ApolloServer({
    schema: await buildSchema({
      resolvers: [GameResolver, UserResolver, AthleteResolver, TeamResolver, TimeframeResolver, ScheduleResolver, CricketAthleteResolver],
      validate: false,
      authChecker,
    }),
    csrfPrevention: false,
    context: async ({ req, res }: IContext) => {
      return {
        req,
        res,
      }
    },
  })
  await apolloServer.start()

  apolloServer.applyMiddleware({ app, cors: false })

  app.get("/", (_, res) => {
    res.send("Healthy!")
  })

  app.use(Sentry.Handlers.errorHandler())

  app.listen(process.env.PORT || 80, () => {
    console.log("server started at localhost:80")
  })

  const nest = await NestFactory.create(AppModule)
  nest.listen(8000, () => {
    console.log("nest started at localhost:8001")
  })
}

main().catch((err) => {
  console.log(err)
})
