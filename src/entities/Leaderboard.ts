import { Field, ID, Int, ObjectType } from 'type-graphql';
import {
  BaseEntity,
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { SportType } from '../utils/types';
import { GameTeam } from './GameTeam';

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

  @Field(() => Number, { nullable: true })
  @Column({ type: 'numeric', nullable: true })
  nearGameId?: number;

  @Field(() => Number, { nullable: true })
  @Column({ type: 'numeric', nullable: true })
  polygonGameId?: number;

  @Field(() => [GameTeam])
  @OneToMany(() => GameTeam, (gameTeam) => gameTeam.game, {
    cascade: true,
  })
  teams!: Relation<GameTeam>[];
}
