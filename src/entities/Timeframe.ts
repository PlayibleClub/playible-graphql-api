import { Field, Float, ID, Int, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from  "typeorm"
import { SportType } from "../utils/types"
@ObjectType()
@Entity()
export class Timeframe extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => Int, { nullable: false})
  @Column("integer", { nullable: false, default: 2023})
  season: number = 2023

  @Field(() => Int, { nullable: false})
  @Column("integer", { nullable: false, default: 1})
  seasonType: number = 1

  @Field(() => String, {nullable: true})
  @Column({type: "varchar", length: 50, nullable: true})
  apiName?: string

  @Field(() => String, {nullable: true})
  @Column({ type: "varchar", length: 10, nullable: true})
  apiSeason?: string

  @Field(() => String, { nullable: true})
  @Column({ type: "varchar", length: 10, nullable: true})
  apiWeek?: string

  @Field(() => String)
  @Column({
    type: "enum",
    enum: SportType,
    default: SportType.MLB,
  })
  sport: SportType = SportType.MLB

  @Field(() => Date)
  @Column({ type: "timestamptz"})
  startDate!: Date

  @Field(() => Date)
  @Column({ type: "timestamptz"})
  endDate!: Date
}