import { Field, ID, ObjectType } from 'type-graphql';
import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';

import { Account } from './Account';
import { Game } from './Game';
import { GameTeamAthlete } from './GameTeamAthlete';
import { Leaderboard } from './Leaderboard';
@ObjectType()
@Entity()
export class GameTeam extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number;

  @Field(() => String)
  @Column({ type: 'varchar', length: 155 })
  name!: string;

  @Field(() => String)
  @Column({ type: 'varchar', length: 155 })
  wallet_address!: string;

  @Field(() => Number, { defaultValue: 0 })
  @Column({ type: 'numeric', default: 0 })
  fantasyScore: number = 0;

  @Field(() => Game)
  @ManyToOne(() => Game, (game) => game.teams, {
    onDelete: 'CASCADE',
    orphanedRowAction: 'delete',
  })
  game!: Relation<Game>;

  // @Field(() => Account)
  // @ManyToOne(() => Account, (account) => account.teams)
  // account!: Relation<Account>

  @Field(() => [GameTeamAthlete])
  @OneToMany(
    () => GameTeamAthlete,
    (gameTeamAthlete) => gameTeamAthlete.gameTeam,
    {
      cascade: true,
    }
  )
  athletes!: Relation<GameTeamAthlete>[];
}
