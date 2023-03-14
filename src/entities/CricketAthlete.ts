import { Field, Float, ID, Int, ObjectType } from 'type-graphql'
import { BaseEntity, Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn , Relation } from 'typeorm'
import { CricketTeam } from './CricketTeam'

@ObjectType()
@Entity()
export class CricketAthlete extends BaseEntity{

  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String, { nullable: true})
  @Column({ type: "varchar", length: 50, nullable: true})
  playerKey!: string

  @Field(()=> String, { nullable: true})
  @Column({ type: "varchar", length: 155, nullable: true})
  name!: string

  @Field(() => String, { nullable: true})
  @Column({ type: "varchar", length: 155, nullable: true})
  jerseyName!: string

  @Field(() => String, { nullable: true})
  @Column({ type: "varchar", length: 50, nullable: true})
  gender!: string

  @Field(() => String, { nullable: true})
  @Column({ type: "varchar", length: 50, nullable: true})
  nationality!: string

  @Field(() => String, { nullable: true})
  @Column({ type: "varchar", length: 50, nullable: true})
  seasonalRole!: string

  @Field(() => CricketTeam)
  @ManyToOne(() => CricketTeam, (cricketTeam) => cricketTeam.athletes)
  cricketTeam!: Relation<CricketTeam>
}