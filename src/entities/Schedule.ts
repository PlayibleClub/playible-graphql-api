import { SportType } from "../utils/types"
import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from "typeorm"
import { Field, Float, ID, Int, ObjectType } from "type-graphql"

@ObjectType()
@Entity()
export class Schedule extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => Int, { nullable: false})
  @Column("integer", { nullable: false})
  gameId!: number

  @Field(() => Int, { nullable: false})
  @Column("integer", { nullable: false})
  season!: number

  @Field(() => Int, { nullable: false})
  @Column("integer", { nullable: false})
  seasonType!: number

  @Field(() => String, { nullable: true})
  @Column({type: "varchar", length: 20, nullable: true})
  status!: string

  @Field(() => Boolean, { defaultValue: false})
  @Column({ type: "boolean", default: false, nullable: false})
  isClosed: boolean = false

  @Field(() => Date)
  @Column({ type: "timestamptz", nullable: true})
  dateTime?: Date

  @Field(() => Date)
  @Column({ type: "timestamptz", nullable: true})
  dateTimeUTC?: Date


}
