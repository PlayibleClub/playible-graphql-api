import { Field, ID, Int, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from "typeorm"

import { SportType } from "../utils/types"

@ObjectType()
@Entity()
export class Game extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  name!: string

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
}
