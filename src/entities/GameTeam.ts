import { Field, ID, ObjectType } from "type-graphql"
import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm"

import { Account } from "./Account"
import { Game } from "./Game"
import { GameTeamAthlete } from "./GameTeamAthlete"

@ObjectType()
@Entity()
export class GameTeam extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  name!: string

  @Field(() => Number)
  @Column({ type: "numeric" })
  fantasyScore!: number

  @Field(() => Game)
  @ManyToOne(() => Game, (game) => game.teams)
  game!: Relation<Game>

  @Field(() => Account)
  @ManyToOne(() => Account, (account) => account.teams)
  account!: Relation<Account>

  @Field(() => [GameTeamAthlete])
  @OneToMany(
    () => GameTeamAthlete,
    (gameTeamAthlete) => gameTeamAthlete.gameTeam,
    {
      cascade: true,
    }
  )
  athletes!: Relation<GameTeamAthlete>[]
}
