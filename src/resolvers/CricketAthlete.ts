import { AthleteStatType, SportType } from './../utils/types'
import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver } from 'type-graphql'
import { IsNull, Not, In} from 'typeorm'
import { CricketAthlete } from '../entities/CricketAthlete'
import { CricketAthleteStat } from '../entities/CricketAthleteStat'
import { CricketTeam } from '../entities/CricketTeam'
import { Contract } from "near-api-js"
import moment from 'moment'
import { setup } from "../near-api"
//import CRICKET_ATHLETE_IDS, CRICKET_ATHLETE_PROMO_IDS

const chunkify = (a: any[], n: number, balanced: boolean) => {
  if (n < 2) return [a]

  var len = a.length,
    out = [],
    i = 0,
    size

  if (len % n === 0) {
    size = Math.floor(len / n)
    while (i < len) {
      out.push(a.slice(i, (i += size)))
    }
  } else if (balanced) {
    while (i < len) {
      size = Math.ceil((len - i) / n--)
      out.push(a.slice(i, (i += size)))
    }
  } else {
    n--
    size = Math.floor(len / n)
    if (len % size === 0) size--
    while (i < size * n) {
      out.push(a.slice(i, (i += size)))
    }
    out.push(a.slice(size * n))
  }

  return out
}
@Resolver()
export class CricketAthleteResolver {
  @Query(() => CricketAthlete)
  async getAthleteByKey(
    @Arg("key") key: string,
    @Arg("from", { nullable: true}) from?: Date,
    @Arg("to", { nullable: true}) to?: Date
  ) : Promise<CricketAthlete>{
    const athlete = await CricketAthlete.findOneOrFail({
      where: {playerKey: key},
      relations: {
        stats: {
          match: true,
        },
        cricketTeam: true,
      }
    })

    if(from){
      athlete.stats = athlete.stats.filter((stat) => stat.match?.start_at && moment(stat.match.start_at).unix() >= moment(from).unix())
    }
    if(to){
      athlete.stats = athlete.stats.filter((stat) => stat.match?.start_at && moment(stat.match.start_at).unix() <= moment(to).unix())
    }

    return athlete
  }
  @Query(() => CricketAthlete)
  async getAthleteMatchResults(
    @Arg("playerkey") playerKey: string,
    @Arg("matchKey", { nullable: true}) matchKey: string,
  ): Promise<CricketAthlete> {
    // const athlete = await CricketAthlete.findOneOrFail({
    //   where: { playerKey: playerKey, stats: {match: {key: matchKey}}},
    //   relations: {
    //     stats: {
    //       match: true
    //     },
    //     cricketTeam: true,
    //   }
    // })
    // const athlete = await CricketAthlete.findOneOrFail({
    //   where: { playerKey: playerKey },
    //   relations: {
    //     stats:{
    //       match: true
    //     },
    //     cricketTeam: true,
    //   } 
    // })

    // if(matchKey){
    //   athlete.stats = athlete.stats.filter((stat) => stat.match.key === matchKey)
    // }
    // return athlete
    const athlete = await CricketAthlete.findOneOrFail({
      where: { playerKey: playerKey, stats: {match: Not(IsNull())}},
      relations: {
        stats: {
          match: {
            team_a: true,
            team_b: true,
          }
        },
        cricketTeam: true
      }
    })
    if(matchKey){
      athlete.stats = athlete.stats.filter((stat) => stat.match !== undefined && stat.match.key === matchKey)
    }
    return athlete
  }
  @Query(() => CricketAthlete)
  async getCricketAthleteAvgFantasyScore(
    @Arg("playerKey") playerKey: string,
  ): Promise<CricketAthlete>{
    const athlete = await CricketAthlete.findOneOrFail({
      where: { playerKey: playerKey, stats: { match: Not(IsNull())}},
      relations: {
        stats: {
          match: true,
        }
      }
    })
    athlete.stats = athlete.stats.filter((stat) => stat.match !== undefined && stat.match.status === 'completed')
    return athlete
  }
  // @Query(() => [CricketAthlete])
  // async getAthlete(

  // )
  @Authorized("ADMIN")
  @Mutation(() => Number)
  async addStarterCricketAthletesToOpenPackContract(@Arg("isPromo") isPromo: boolean = false): Promise<Number>{
    let contractId
    let athleteIds: number[] = []

    switch(isPromo){
      case false:
        contractId = process.env.OPENPACK_CRICKET_ACCOUNT_ID
        //add athlete id list here
        break
      case true:
        contractId = process.env.OPENPACK_CRICKET_PROMO_ACCOUNT_ID
        //add promo athlete id list here
        break
      
    }

    const nearApi = await setup()
    const account = await nearApi.account(process.env.NEAR_MAIN_ACCOUNT_ID || "")
    const contract: any = new Contract(account, contractId || "", {
      viewMethods: [],
      changeMethods: ["execute_add_athletes"],
    })

    const athleteTokens = (await CricketAthlete.find({ where: {playerKey: In(['a', 'b'])}, order: { id: "ASC"}, relations: { cricketTeam: true}})).map(
      (athlete) => {
        if (isPromo){
          return {
            athlete_id: athlete.id.toString(),
            soulbound_token_uri: athlete.nftImageLocked,
            single_use_token_uri: athlete.nftImagePromo,
            symbol: athlete.playerKey,
            name: athlete.name,
            team: athlete.cricketTeam.key,
            position: athlete.seasonalRole,
          }
        } else{
          return {
            athlete_id: athlete.id.toString(),
            token_uri: athlete.nftImage,
            symbol: athlete.playerKey,
            name: athlete.name,
            team: athlete.cricketTeam.key,
            position: athlete.seasonalRole
          }
        }
      }
    )

    const chunkifiedAthleteTokens = chunkify(athleteTokens, 10, false)

    for (const _athleteTokens of chunkifiedAthleteTokens) {
      await contract.execute_add_athletes({ pack_type: "starter", athlete_tokens: _athleteTokens}, "300000000000000")

    }

    return athleteTokens.length
  }
}
