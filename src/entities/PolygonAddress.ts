import { Field, ID, ObjectType } from 'type-graphql';
import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { PolygonToken } from './PolygonToken';
@ObjectType()
@Entity()
export class PolygonAddress extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number;

  @Field(() => String)
  @Column('text', { unique: true })
  address!: string;

  @Field(() => [PolygonToken])
  @OneToMany(() => PolygonToken, (token) => token.polygonAddress, {
    cascade: true,
  })
  tokens!: Relation<PolygonToken>[];
}
