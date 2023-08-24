import { InputType, Field } from "type-graphql"

export enum SportType {
  MLB = "mlb",
  MLB_PROMO = "mlb-promo",
  NBA = "nba",
  NBA_PROMO = "nba-promo",
  NFL = "nfl",
  CRICKET = "cricket",
  TEST = "test",
}

export enum AthleteStatType {
  WEEKLY = "weekly",
  SEASON = "season",
  DAILY = "daily",
}

export enum GameTab {
  NEW = "new",
  ACTIVE = "active",
  COMPLETED = "completed",
}

export enum ResponseStatus {
  PENDING = "pending",
  SUCCESS = "success",
  FAILED = "failed",
}

export type SubmitLineupType = {
  game_id: number,
  team_name: string,
  token_ids: string[],
  token_promo_ids: string[],
}

export type SportMap = {
  'baseball' : SportType,
  'basketball': SportType,
  'nfl': SportType
}

export type AddGameType = {
  game_id: number,
  game_time_start: number,
  game_time_end: number,
  whitelist: string[],
  positions: [{
    positions: string[],
    amount: number,
  }]
}

@InputType()
export class LimitOffset {
  @Field({ nullable: true })
  limit?: number
  @Field({ nullable: true })
  offset?: number
}
