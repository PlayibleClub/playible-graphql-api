import { Field, ID, ObjectType } from "type-graphql"
import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm"
import { Asset } from "./Asset"

@ObjectType()
@Entity()
export class Account extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number

  @Field(() => String)
  @Column("text")
  address!: string

  @Field(() => [Asset])
  @OneToMany(() => Asset, (asset) => asset.account, {
    cascade: true,
  })
  assets!: Relation<Asset>[]
}
