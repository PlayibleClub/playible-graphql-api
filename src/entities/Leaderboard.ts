import { Field, ID, Int, ObjectType } from 'type-graphql';
import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
  Relation,
} from 'typeorm';
import { SportType } from '../utils/types';
import { GameTeam } from './GameTeam';
import { Game } from './Game';

@ObjectType()
@Entity()
export class Leaderboard extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id!: number;

  @Field(() => String)
  @Column({
    type: 'enum',
    enum: SportType,
    default: SportType.MLB,
  })
  sport: SportType = SportType.MLB;

  @Field(() => Game, { nullable: true })
  @OneToOne(() => Game, { cascade: true, nullable: true })
  @JoinColumn()
  nearGame?: Relation<Game> | null;

  @Field(() => Game, { nullable: true })
  @OneToOne(() => Game, { cascade: true, nullable: true })
  @JoinColumn()
  polygonGame?: Relation<Game> | null;
}
