import { Field, Float, ID, Int, ObjectType } from 'type-graphql'
import { BaseEntity, Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn , Relation } from 'typeorm'

@ObjectType()
@Entity()
export class Athlete extends BaseEntity{

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


}