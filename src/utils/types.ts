import { InputType, Field } from "type-graphql"

export enum SportType {
  MLB = "mlb",
  MLB_PROMO = "mlb-promo",
  NBA = "nba",
  NBA_PROMO = "nba-promo",
  NFL = "nfl",
  CRICKET = "cricket",
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

export type SubmitLineupType = {
  game_id: number,
  team_name: string,
  token_id: string[],
  token_promo_ids: string[],
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
