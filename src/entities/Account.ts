import { Field, ID, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm"
import { Asset } from "./Asset"
import { GameTeam } from "./GameTeam"

@ObjectType()
@Entity()
export class Account extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column("text", { unique: true })
  address!: string

  @Field(() => [Asset])
  @OneToMany(() => Asset, (asset) => asset.account, {
    cascade: true,
  })
  assets!: Relation<Asset>[]

  @Field(() => [GameTeam])
  @OneToMany(() => GameTeam, (gameTeam) => gameTeam.account, {
    cascade: true,
  })
  teams!: Relation<GameTeam>[]
}
