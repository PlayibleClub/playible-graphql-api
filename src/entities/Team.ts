import { SportType } from "../utils/types"
import { Field, ID, ObjectType } from "type-graphql"
import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm"
import { Athlete } from "./Athlete"

@ObjectType()
@Entity()
export class Team extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => ID)
  @Column("integer", { unique: true })
  apiId!: number

  @Field(() => String)
  @Column({ type: "varchar", length: 155, unique: true })
  name!: string

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  key!: string

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  location!: string

  @Field(() => String)
  @Column({
    type: "enum",
    enum: SportType,
    default: SportType.MLB,
  })
  sport: SportType = SportType.MLB

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  primaryColor!: string

  @Field(() => String)
  @Column({ type: "varchar", length: 155 })
  secondaryColor!: string

  @Field(() => [Athlete])
  @OneToMany(() => Athlete, (athlete) => athlete.team, {
    cascade: true,
  })
  athletes!: Relation<Athlete>[]
}
