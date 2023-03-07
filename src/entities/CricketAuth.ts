import { Field, ID, ObjectType } from "type-graphql"
import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from "typeorm"


@Entity()
export class CricketAuth extends BaseEntity {
  
  @PrimaryGeneratedColumn()
  id!: number

  
  @Column("text", {unique : true})
  token!: string
}