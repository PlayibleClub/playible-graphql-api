import { AthleteStatType, SportType } from "./../utils/types"
import { Contract } from "near-api-js"

import { Arg, Authorized, Field, Mutation, ObjectType, Query, Resolver } from "type-graphql"
import { AthleteSortOptions, GetAthletesArgs } from "../args/AthleteArgs"
import { setup } from "../near-api"
import axios from "axios"
import { S3 } from 'aws-sdk'
import { Athlete } from "../entities/Athlete"
import { AthleteStat } from "../entities/AthleteStat"
import { Team } from "../entities/Team"
import fs from 'fs'
import { In, MoreThanOrEqual, LessThanOrEqual} from "typeorm"
import { NFL_ATHLETE_IDS, NBA_ATHLETE_IDS, NBA_ATHLETE_PROMO_IDS, MLB_ATHLETE_IDS, MLB_ATHLETE_PROMO_IDS, TEST_ATHLETE_IDS } from "./../utils/athlete-ids"
import moment from "moment"

@ObjectType()
class Distribution {
  @Field()
  rank: number
  @Field()
  percentage: number
}

@ObjectType()
class TestResponse {
  @Field()
  gameId: string
  @Field()
  prize: number
  @Field(() => [Distribution])
  distribution: Distribution[]
}

@ObjectType()
class UserAthleteResponse {
  @Field()
  tokenId: string
  @Field(() => Athlete)
  athlete: Athlete
}

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
export class AthleteResolver {
  @Query(() => Athlete)
  async getAthleteById(
    @Arg("id") id: number,
    @Arg("from", { nullable: true }) from?: Date,
    @Arg("to", { nullable: true }) to?: Date,
    @Arg("season", {nullable: true}) season?: string,
  ): Promise<Athlete> {
    const athlete = await Athlete.findOneOrFail({
      where: { id },
      relations: {
        stats: { opponent: true },
        team: true,
      },
    })

    if (season){
      athlete.stats = athlete.stats.filter((stat) => stat.season === season)
    }
    
    if (from) {
      //athlete.stats = athlete.stats.filter((stat) => stat.gameDate && stat.gameDate.toISOString() >= from.toISOString())
      athlete.stats = athlete.stats.filter((stat) => stat.gameDate && moment(stat.gameDate).unix() >= moment(from).unix())
    }

    if (to) {
      athlete.stats = athlete.stats.filter((stat) => stat.gameDate && moment(stat.gameDate).unix() <= moment(to).unix())
    }

    return athlete
  }

  @Query(() => [Athlete])
  async getAthleteByIds(@Arg("ids", () => [Number]) ids: number[]): Promise<Athlete[]> {
    return await Athlete.find({
      where: { id: In(ids) },
      relations: {
        stats: true,
        team: true,
      },
    })
  }

  @Query(() => [Athlete])
  async getAthletes(
    @Arg("args", { nullable: true })
    { sort, filter, pagination }: GetAthletesArgs
  ): Promise<Athlete[]> {
    let args: any = {}
    let order: any = {
      id: "asc",
    }

    switch (sort) {
      case AthleteSortOptions.ID:
        order = {
          id: "asc",
        }
        break
      case AthleteSortOptions.SCORE:
        order = {
          stats: {
            fantasyScore: "desc",
          },
        }
        break
    }

    if (pagination) {
      args["take"] = pagination.limit
      args["skip"] = pagination.offset
    }

    let athletes = await Athlete.find({
      ...args,
      where: filter?.sport
        ? {
            team: { sport: filter?.sport },
            stats: {
              ...(sort === AthleteSortOptions.SCORE && { fantasyScore: MoreThanOrEqual(0) }),
              ...(filter?.statType && { type: filter?.statType }),
            },
          }
        : { stats: { fantasyScore: MoreThanOrEqual(0), ...(filter?.statType && { type: filter?.statType }) } },
      relations: {
        stats: { opponent: true },
        team: true,
      },
      order: order,
    })

    return athletes
  }

  @Query(() => [UserAthleteResponse])
  async getUserAthletePortfolio(@Arg("accountId") accountId: string, @Arg("sportType") sportType: SportType): Promise<UserAthleteResponse[]> {
    const nearApi = await setup()
    const account = await nearApi.account(process.env.NEAR_MAIN_ACCOUNT_ID || "")
    let contractId

    switch (sportType) {
      case SportType.NFL:
        contractId = process.env.ATHLETE_NFL_NFT_ACCOUNT_ID
        break
      case SportType.NBA:
        contractId = process.env.ATHLETE_NBA_NFT_ACCOUNT_ID
        break
      case SportType.MLB:
        contractId = process.env.ATHLETE_MLB_NFT_ACCOUNT_ID
        break
      default:
        contractId = process.env.ATHLETE_NFL_NFT_ACCOUNT_ID
        break
    }

    const contract: any = new Contract(account, contractId || "", {
      viewMethods: ["nft_tokens_for_owner"],
      changeMethods: [],
    })

    const res: any = await contract.nft_tokens_for_owner({
      account_id: accountId,
    })
    const ids = res.map((token: any) => {
      const idTrait = JSON.parse(token.metadata.extra).find((trait: any) => trait.trait_type === "athlete_id")
      return { tokenId: token.token_id, id: parseInt(idTrait.value) }
    })
    const athletes = await Athlete.find({
      where: { id: In(ids.map((id: any) => id.id)) },
      relations: { team: true, stats: { opponent: true } },
    })

    return athletes.map((athlete) => {
      return {
        tokenId: ids.find((id: any) => id.id === athlete.id)?.tokenId,
        athlete: athlete,
      }
    })
  }

  //@Authorized("ADMIN")
  @Mutation(() => Number)
  async addAthletesToFilebaseS3IPFSBucket(@Arg("sportType") sportType: SportType, @Arg("isPromo") isPromo: boolean = false ): Promise<Number> {
    let athleteIds: number[] = []
    console.log(isPromo)
    //setup AWS S3 bucket
    const s3Filebase = new S3({
      apiVersion: '2006-03-01',
      endpoint: 'https://s3.filebase.com',
      region: 'us-east-1',
      accessKeyId: process.env.FILEBUCKET_ACCESS_KEY_ID,
      secretAccessKey: process.env.FILEBUCKET_SECRET_ACCESS_KEY,
      s3ForcePathStyle: true,
    })
    const s3Playible = new S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    })
    switch (sportType){
      case SportType.TEST:
        athleteIds = TEST_ATHLETE_IDS
        break
    }

    const athletes = await Athlete.find({
      where: {
        apiId: In(athleteIds)
      }
    })

    for (let athlete of athletes){
      //const filePath = athlete.nftImage !== undefined ? athlete.nftImage : 'default' //temporarily has local filepath of NFT sample image

      // fs.readFile(filePath, (err, data) => {

      //   if (err) {
      //     console.error(err)
          
      //   }
      //   const params = {
      //     Bucket: 'buckettest69',
      //     ContentType: 'image/png',
      //     Key: 'test.png',
      //     Body: data,
      //     ACL: 'public-read',
      //     Metadata: { firstName: athlete.firstName, lastName: athlete.lastName, apiId: athlete.apiId.toString()}
      //   }
  
      //   const request = s3.putObject(params)
      //   request.on('httpHeaders', async (statusCode, headers) => {
      //     console.log(`Status Code ${statusCode}`)
      //     console.log(`CID: ${headers['x-amz-meta-cid']}`)
      //     athlete.nftAnimation = headers['x-amz-meta-cid']
      //     await Athlete.save(athlete)
      //   })
      //   request.send()
      // })

      console.log(`Reading athlete ${athlete.id}`)
      
      // const request = s3Filebase.putObject(fileBaseParams)
      // request.on('httpHeaders', async (statusCode, headers) => {
      //   console.log(`Status Code ${statusCode}`)
      //   console.log(`CID: ${headers['x-amz-meta-cid']}`)
      //   athlete.nftAnimation = headers['x-amz-meta-cid']
      //   await Athlete.save(athlete)
      // })
      // request.send()
      const response = await axios.get(athlete.nftImage ?? 'default', { responseType: 'arraybuffer'})
      const data = Buffer.from(response.data, "utf-8")
      const fileBaseParams = {
        Bucket: 'buckettest69',
        ContentType: 'image/png',
        Key: `${athlete.firstName}_${athlete.lastName}.png`,
        ACL: 'public-read',
        Body: data,
        Metadata: { firstName: athlete.firstName, lastName: athlete.lastName, apiId: athlete.apiId.toString()}
      }
      const request = s3Filebase.putObject(fileBaseParams)
      request.on('httpHeaders', async (statusCode, headers) => {
        console.log(`Status Code ${statusCode}`)
        console.log(`CID: ${headers['x-amz-meta-cid']}`)
        athlete.nftAnimation = headers['x-amz-meta-cid']
        await Athlete.save(athlete)
      })
      request.send()
    }
    
    return athletes.length
  }
  @Authorized("ADMIN")
  @Mutation(() => Number)
  async addStarterAthletesToOpenPackContract(@Arg("sportType") sportType: SportType, @Arg("isPromo") isPromo: boolean = false): Promise<Number> {
    let contractId
    let athleteIds: number[] = []

    switch (sportType) {
      case SportType.NFL:
        contractId = process.env.OPENPACK_NFL_ACCOUNT_ID
        athleteIds = NFL_ATHLETE_IDS
        break
      case SportType.NBA:
        contractId = process.env.OPENPACK_NBA_ACCOUNT_ID
        athleteIds = NBA_ATHLETE_IDS
        break
      case SportType.NBA_PROMO:
        contractId = process.env.OPENPACK_NBA_PROMO_ACCOUNT_ID
        athleteIds = NBA_ATHLETE_PROMO_IDS
        break
      case SportType.MLB:
        contractId = process.env.OPENPACK_MLB_ACCOUNT_ID //add MLB athlete ids here
        athleteIds = MLB_ATHLETE_IDS
        break
      case SportType.MLB_PROMO:
        contractId = process.env.OPENPACK_MLB_PROMO_ACCOUNT_ID
        athleteIds = MLB_ATHLETE_PROMO_IDS
        break
      default:
        contractId = process.env.OPENPACK_NFL_ACCOUNT_ID //add cricket athlete id/key here
        break
    }

    const nearApi = await setup()
    const account = await nearApi.account(process.env.NEAR_MAIN_ACCOUNT_ID || "")
    const contract: any = new Contract(account, contractId || "", {
      viewMethods: [],
      changeMethods: ["execute_add_athletes"],
    })

    const athleteTokens = (await Athlete.find({ where: { apiId: In(athleteIds) }, order: { id: "ASC" }, relations: { team: true } })).map(
      (athlete) => {
        if (isPromo) {
          return {
            athlete_id: athlete.id.toString(),
            soulbound_token_uri: athlete.nftImageLocked,
            single_use_token_uri: athlete.nftImagePromo,
            symbol: athlete.apiId.toString(),
            name: `${athlete.firstName} ${athlete.lastName}`,
            team: athlete.team.key,
            position: athlete.position,
          }
        } else {
          return {
            athlete_id: athlete.id.toString(),
            token_uri: athlete.nftImage,
            symbol: athlete.apiId.toString(),
            name: `${athlete.firstName} ${athlete.lastName}`,
            team: athlete.team.key,
            position: athlete.position,
          }
        }
      }
    )

    const chunkifiedAthleteTokens = chunkify(athleteTokens, 10, false)

    for (const _athletesTokens of chunkifiedAthleteTokens) {
      await contract.execute_add_athletes({ pack_type: "starter", athlete_tokens: _athletesTokens }, "300000000000000")
    }

    return athleteTokens.length
  }

  @Authorized("ADMIN")
  @Mutation(() => String)
  async updateNflAthleteStatsSeason(@Arg("season") season: string): Promise<String> {
    const { data, status } = await axios.get(
      `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerSeasonStats/${season}?key=${process.env.SPORTS_DATA_NFL_KEY}`
    )

    if (status === 200) {
      const newStats: AthleteStat[] = []
      const updateStats: AthleteStat[] = []

      for (let athleteStat of data) {
        const apiId: number = athleteStat["PlayerID"]
        const numberOfGames: number = athleteStat["Played"] > 0 ? athleteStat["Played"] : 1
        const curStat = await AthleteStat.findOne({
          where: { athlete: { apiId }, season: season.toString(), type: AthleteStatType.SEASON },
          relations: {
            athlete: true,
          },
        })

        if (curStat) {
          // Update stats here
          curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"] / numberOfGames
          curStat.completion = athleteStat["PassingCompletionPercentage"] / numberOfGames
          curStat.carries = athleteStat["RushingAttempts"] / numberOfGames
          curStat.passingYards = athleteStat["PassingYards"] / numberOfGames
          curStat.rushingYards = athleteStat["RushingYards"] / numberOfGames
          curStat.receivingYards = athleteStat["ReceivingYards"] / numberOfGames
          curStat.interceptions = athleteStat["PassingInterceptions"] / numberOfGames
          curStat.passingTouchdowns = athleteStat["PassingTouchdowns"] / numberOfGames
          curStat.rushingTouchdowns = athleteStat["RushingTouchdowns"] / numberOfGames
          curStat.receivingTouchdowns = athleteStat["ReceivingTouchdowns"] / numberOfGames
          curStat.targets = athleteStat["ReceivingTargets"] / numberOfGames
          curStat.receptions = athleteStat["Receptions"] / numberOfGames
          curStat.played = athleteStat["Played"]
          updateStats.push(curStat)
        } else {
          const curAthlete = await Athlete.findOne({
            where: { apiId },
          })

          if (curAthlete) {
            newStats.push(
              AthleteStat.create({
                athlete: curAthlete,
                season: season.toString(),
                type: AthleteStatType.SEASON,
                position: athleteStat["Position"],
                played: athleteStat["Played"],
                fantasyScore: athleteStat["FantasyPointsDraftKings"] / numberOfGames,
                completion: athleteStat["PassingCompletionPercentage"] / numberOfGames,
                carries: athleteStat["RushingAttempts"] / numberOfGames,
                passingYards: athleteStat["PassingYards"] / numberOfGames,
                rushingYards: athleteStat["RushingYards"] / numberOfGames,
                receivingYards: athleteStat["ReceivingYards"] / numberOfGames,
                passingTouchdowns: athleteStat["PassingTouchdowns"] / numberOfGames,
                interceptions: athleteStat["PassingInterceptions"] / numberOfGames,
                rushingTouchdowns: athleteStat["RushingTouchdowns"] / numberOfGames,
                receivingTouchdowns: athleteStat["ReceivingTouchdowns"] / numberOfGames,
                targets: athleteStat["ReceivingTargets"] / numberOfGames,
                receptions: athleteStat["Receptions"] / numberOfGames,
              })
            )
          }
        }
      }

      await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })

      return `New Stats Added: ${newStats.length} | Stats Updated: ${updateStats.length}`
    }

    return "No stats added or updated"
  }

  @Authorized("ADMIN")
  @Mutation(() => String)
  async updateNflAthleteStatsPerWeek(@Arg("season") season: string, @Arg("lastWeekOfSeason") week: string): Promise<String> {
    for (let curWeek = 1; curWeek <= Number(week); curWeek++) {
      const { data, status } = await axios.get(
        `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerGameStatsByWeek/${season}/${curWeek}?key=${process.env.SPORTS_DATA_NFL_KEY}`
      )

      if (status === 200) {
        const newStats: AthleteStat[] = []
        const updateStats: AthleteStat[] = []

        for (let athleteStat of data) {
          const apiId: number = athleteStat["PlayerID"]
          const curStat = await AthleteStat.findOne({
            where: { athlete: { apiId }, season: season, week: curWeek.toString(), type: AthleteStatType.WEEKLY },
            relations: {
              athlete: true,
            },
          })

          const opponent = await Team.findOne({
            where: { apiId: athleteStat["GlobalOpponentID"] },
          })

          if (curStat) {
            // Update stats here
            curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"]
            curStat.completion = athleteStat["PassingCompletionPercentage"]
            curStat.carries = athleteStat["RushingAttempts"]
            curStat.passingYards = athleteStat["PassingYards"]
            curStat.rushingYards = athleteStat["RushingYards"]
            curStat.receivingYards = athleteStat["ReceivingYards"]
            curStat.interceptions = athleteStat["PassingInterceptions"]
            curStat.passingTouchdowns = athleteStat["PassingTouchdowns"]
            curStat.rushingTouchdowns = athleteStat["RushingTouchdowns"]
            curStat.receivingTouchdowns = athleteStat["ReceivingTouchdowns"]
            curStat.targets = athleteStat["ReceivingTargets"]
            curStat.receptions = athleteStat["Receptions"]
            curStat.played = athleteStat["Played"]
            curStat.opponent = opponent
            updateStats.push(curStat)
          } else {
            const curAthlete = await Athlete.findOne({
              where: { apiId },
            })

            if (curAthlete) {
              newStats.push(
                AthleteStat.create({
                  athlete: curAthlete,
                  season: season,
                  week: curWeek.toString(),
                  opponent: opponent,
                  gameDate: new Date(athleteStat["GameDate"]),
                  type: AthleteStatType.WEEKLY,
                  played: athleteStat["Played"],
                  position: athleteStat["Position"],
                  fantasyScore: athleteStat["FantasyPointsDraftKings"],
                  completion: athleteStat["PassingCompletionPercentage"],
                  carries: athleteStat["RushingAttempts"],
                  passingYards: athleteStat["PassingYards"],
                  rushingYards: athleteStat["RushingYards"],
                  receivingYards: athleteStat["ReceivingYards"],
                  passingTouchdowns: athleteStat["PassingTouchdowns"],
                  interceptions: athleteStat["PassingInterceptions"],
                  rushingTouchdowns: athleteStat["RushingTouchdowns"],
                  receivingTouchdowns: athleteStat["ReceivingTouchdowns"],
                  targets: athleteStat["ReceivingTargets"],
                  receptions: athleteStat["Receptions"],
                })
              )
            }
          }
        }

        await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })

        console.log(`Update NFL Athlete Stats Week ${curWeek}: FINISHED`)
      }
    }

    return "Finished updating all weekly stats for NFL"
  }
}
