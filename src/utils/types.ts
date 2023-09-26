import { Field, InputType, Float, ID, Int, ObjectType } from 'type-graphql';
export enum SportType {
  MLB = 'mlb',
  MLB_PROMO = 'mlb-promo',
  NBA = 'nba',
  NBA_PROMO = 'nba-promo',
  NFL = 'nfl',
  NFL_PROMO = 'nfl-promo',
  CRICKET = 'cricket',
}

export enum AthleteStatType {
  WEEKLY = 'weekly',
  SEASON = 'season',
  DAILY = 'daily',
}

export enum GameTab {
  NEW = 'new',
  ACTIVE = 'active',
  COMPLETED = 'completed',
}

export enum ResponseStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export type SubmitLineupType = {
  game_id: number;
  team_name: string;
  token_ids: string[];
  token_promo_ids: string[];
};

export type SportMap = {
  baseball: SportType;
  basketball: SportType;
  nfl: SportType;
};

export type IPFSMetadata = {
  name: string;
  description: string;
  image: string;
  properties: {
    athleteId: string;
    symbol: string;
    name: string;
    team: string;
    position: string;
  };
};

export type AddGameType = {
  game_id: number;
  game_time_start: number;
  game_time_end: number;
  whitelist: string[];
  positions: [
    {
      positions: string[];
      amount: number;
    }
  ];
};

export type EventAddGameType = {
  standard: string;
  version: string;
  event: string;
  data: [
    {
      result: string;
      game_id: number;
      game_time_start: number;
      game_time_end: number;
    }
  ];
};

export type EventSubmitLineupType = {
  standard: string;
  version: string;
  event: string;
  data: [
    {
      result: string;
      game_id: number;
      team_name: string;
      signer: string;
      lineup: string[];
    }
  ];
};

@InputType()
export class LimitOffset {
  @Field({ nullable: true })
  limit?: number;
  @Field({ nullable: true })
  offset?: number;
}

@ObjectType()
export class LeaderboardResult {
  @Field(() => ID)
  game_team_id: number;

  @Field(() => String)
  team_name: string;

  @Field(() => String)
  wallet_address: string;

  @Field(() => Number)
  total: number;
}
