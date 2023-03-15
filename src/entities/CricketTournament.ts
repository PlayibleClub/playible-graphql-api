import { SportType } from "../utils/types"
import { Field, Float, ID, Int, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, ManyToOne, OneToMany, ManyToMany, PrimaryGeneratedColumn, Relation, JoinTable } from "typeorm"
import { CricketTeam } from "./CricketTeam"

@ObjectType()
@Entity()
export class CricketTournament extends BaseEntity{
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number
  
  @Field(() => String)
  @Column({ type: "varchar"})
  key!: string

  @Field(() => String)
  @Column({ type: "varchar"})
  name!: string

  @Field(() => Date, { nullable: false})
  @Column({ type: "timestamptz", nullable: false})
  start_date!: Date

  @Field(() => [CricketTeam])
  @ManyToMany(() => CricketTeam, (cricketTeams) => cricketTeams.tournaments)
  @JoinTable()
  cricketTeams!: Relation<CricketTeam>

  @Field(() => String)
  @Column({
    type: "enum",
    enum: SportType,
    default: SportType.CRICKET,
  })
  sport: SportType = SportType.CRICKET

  
}