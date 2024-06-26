import { DataSource } from 'typeorm';
import 'dotenv-safe/config';

import { User } from '../entities/User';
import { Account } from '../entities/Account';
import { Asset } from '../entities/Asset';
import { Athlete } from '../entities/Athlete';
import { Collection } from '../entities/Collection';
import { Team } from '../entities/Team';
import { Game } from '../entities/Game';
import { GameTeam } from '../entities/GameTeam';
import { GameTeamAthlete } from '../entities/GameTeamAthlete';
import { AthleteStat } from '../entities/AthleteStat';
import { AdminWallet } from '../entities/AdminWallet';
import { Timeframe } from '../entities/Timeframe';
import { Schedule } from '../entities/Schedule';
import { CricketAuth } from '../entities/CricketAuth';
import { CricketTournament } from '../entities/CricketTournament';
import { CricketTeam } from '../entities/CricketTeam';
import { CricketAthlete } from '../entities/CricketAthlete';
import { CricketAthleteStat } from '../entities/CricketAthleteStat';
import { CricketMatch } from '../entities/CricketMatch';
import { NearBlock } from '../entities/NearBlock';
import { NearResponse } from '../entities/NearResponse';
import { PolygonAddress } from '../entities/PolygonAddress';
import { PolygonToken } from '../entities/PolygonToken';
import { Leaderboard } from '../entities/Leaderboard';
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
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
    AdminWallet,
    Timeframe,
    Schedule,
    CricketTournament,
    CricketTeam,
    CricketAthlete,
    CricketAthleteStat,
    CricketMatch,
    NearBlock,
    NearResponse,
    PolygonAddress,
    PolygonToken,
    Leaderboard,
  ],
  synchronize: true,
  // logging: true,
});
