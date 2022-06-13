import { DataSource } from "typeorm"
import "dotenv-safe/config"

import { User } from "../entities/User"
import { Account } from "../entities/Account"
import { Asset } from "../entities/Asset"
import { Athlete } from "../entities/Athlete"
import { Collection } from "../entities/Collection"
import { Team } from "../entities/Team"
import { Game } from "../entities/Game"
import { GameTeam } from "../entities/GameTeam"
import { GameTeamAthlete } from "../entities/GameTeamAthlete"
import { AthleteStat } from "../entities/AthleteStat"

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  port: 5432,
  entities: [
    User,
    Account,
    Asset,
    Athlete,
    Collection,
    Team,
    Game,
    GameTeam,
    GameTeamAthlete,
    AthleteStat,
  ],
  synchronize: true,
  logging: false,
})
