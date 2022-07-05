import { Field, ID, Int, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, OneToMany, PrimaryGeneratedColumn, Relation } from "typeorm"

import { SportType } from "../utils/types"
import { GameTeam } from "./GameTeam"

@ObjectType()
@Entity()
export class Game extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  name!: string

  @Field(() => String, { nullable: true })
  @Column({ type: "text", nullable: true })
  description?: string

  @Field(() => Date)
  @Column({ type: "timestamptz" })
  startTime!: Date

  @Field(() => Date)
  @Column({ type: "timestamptz" })
  endTime!: Date

  @Field(() => Int)
  @Column("integer")
  duration!: number

  @Field(() => Number)
  @Column({ type: "numeric" })
  prize!: number

  @Field(() => String, { nullable: true })
  @Column({ type: "text", nullable: true })
  image?: string | null

  @Field(() => String)
  @Column({
    type: "enum",
    enum: SportType,
    default: SportType.MLB,
  })
  sport: SportType = SportType.MLB

  @Field(() => [GameTeam])
  @OneToMany(() => GameTeam, (gameTeam) => gameTeam.game, {
    cascade: true,
  })
  teams!: Relation<GameTeam>[]
}
