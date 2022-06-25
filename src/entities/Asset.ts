import { Field, ID, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm"
import { Account } from "./Account"
import { Collection } from "./Collection"
import { GameTeamAthlete } from "./GameTeamAthlete"

@ObjectType()
@Entity()
export class Asset extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column("text", { unique: true })
  tokenId!: string

  @Field(() => Account)
  @ManyToOne(() => Account, (account) => account.assets)
  account!: Relation<Account>

  @Field(() => Collection)
  @ManyToOne(() => Collection, (collection) => collection.assets)
  collection!: Relation<Collection>

  @Field(() => [GameTeamAthlete])
  @OneToMany(() => GameTeamAthlete, (gameTeamAthlete) => gameTeamAthlete.asset, {
    cascade: true,
  })
  gameTeamAthletes!: Relation<GameTeamAthlete>[]
}
