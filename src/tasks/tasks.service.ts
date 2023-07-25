import { Injectable, Logger } from "@nestjs/common"
import { Cron, Interval, Timeout } from "@nestjs/schedule"
import S3 from "aws-sdk/clients/s3"
import axios from "axios"
import fs from "fs"
import { startStream, types } from 'near-lake-framework'
import { LessThanOrEqual, MoreThanOrEqual, Equal, Not, In, QueryBuilder } from "typeorm"
import convert from "xml-js"
import moment from 'moment-timezone'
import WebSocket from 'ws'
import { Athlete } from "../entities/Athlete"
import { AthleteStat } from "../entities/AthleteStat"
import { Game } from "../entities/Game"
import { GameTeam } from "../entities/GameTeam"
import { GameTeamAthlete} from "../entities/GameTeamAthlete"
import { Team } from "../entities/Team"
import { Timeframe } from "../entities/Timeframe"
import { Schedule } from "../entities/Schedule"
import { CricketAuth } from "../entities/CricketAuth"
import { CricketTournament } from "../entities/CricketTournament"
import { CricketTeam } from "../entities/CricketTeam"
import { CricketAthlete } from '../entities/CricketAthlete'
import { CricketAthleteStat } from '../entities/CricketAthleteStat'
import { CricketMatch } from '../entities/CricketMatch'
import { getSeasonType } from "../helpers/Timeframe"
import { ATHLETE_MLB_BASE_ANIMATION, ATHLETE_MLB_BASE_IMG, ATHLETE_MLB_IMG } from "../utils/svgTemplates"
import { AthleteStatType, SportType } from "../utils/types"
import { CricketTeamInterface, CricketAthleteInterface, CricketPointsBreakup } from '../interfaces/Cricket'
import { NFL_ATHLETE_IDS, NBA_ATHLETE_IDS, NBA_ATHLETE_PROMO_IDS, MLB_ATHLETE_IDS, MLB_ATHLETE_PROMO_IDS, IPL2023_ATHLETE_IDS } from "./../utils/athlete-ids"
import { AppDataSource } from "../utils/db"

import lineupSubmission from '../utils/test-jsons/lineup_submission_add_game_result.json'
import e from "express"

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name)

  async testAnimation() {
    const athlete = await Athlete.findOneOrFail({
      where: { id: 1 },
      relations: { team: true },
    })
    const baseImage = ATHLETE_MLB_BASE_IMG
    var options = { compact: true, ignoreComment: true, spaces: 4 }
    var result: any = convert.xml2js(baseImage, options)
    console.log(result["svg"]["g"]["4"]["g"][3]["text"][0]["tspan"]["_cdata"]) // First name
    console.log(result["svg"]["g"]["4"]["g"][3]["g"]["text"][0]["tspan"]["_cdata"]) // First name

    console.log(result["svg"]["g"][4]["g"][3]["text"][1]["tspan"]["_cdata"]) // Last name
    console.log(result["svg"]["g"][4]["g"][3]["g"]["text"][1]["tspan"]["_cdata"]) // Last name

    console.log(result["svg"]["g"][1]["g"][2]["g"]["path"]["_attributes"]["fill"]) // Primary color
    console.log(result["svg"]["g"][1]["g"][0]["g"]["path"]["_attributes"]["fill"]) // Secondary color

    console.log(result["svg"]["g"][4]["g"][2]["g"]["text"]["tspan"]["_cdata"]) // Jersey
    console.log(result["svg"]["g"][4]["g"][0]["g"]["g"]["text"]["tspan"]["_cdata"]) // Position

    result["svg"]["g"]["4"]["g"][3]["text"][0]["tspan"]["_cdata"] = athlete.firstName
    result["svg"]["g"]["4"]["g"][3]["g"]["text"][0]["tspan"]["_cdata"] = athlete.firstName
    result["svg"]["g"][4]["g"][3]["text"][1]["tspan"]["_cdata"] = athlete.lastName
    result["svg"]["g"][4]["g"][3]["g"]["text"][1]["tspan"]["_cdata"] = athlete.lastName
    result["svg"]["g"][1]["g"][2]["g"]["path"]["_attributes"]["fill"] = athlete.team.primaryColor
    result["svg"]["g"][1]["g"][0]["g"]["path"]["_attributes"]["fill"] = athlete.team.secondaryColor
    result["svg"]["g"][4]["g"][2]["g"]["text"]["tspan"]["_cdata"] = athlete.jersey ? athlete.jersey.toString() : "00"
    result["svg"]["g"][4]["g"][0]["g"]["g"]["text"]["tspan"]["_cdata"] = athlete.position

    const animation = convert.js2xml(result, options)
    result = animation.replace("</svg>", ATHLETE_MLB_BASE_ANIMATION)
    // fs.writeFileSync("./testAthleteAnimation.svg", result)
  }

  // @Timeout(1)
  async syncMlbData() {
    const teamsCount = await Team.count({
      where: { sport: SportType.MLB },
    })

    if (teamsCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/teams?key=${process.env.SPORTS_DATA_MLB_KEY}`)

      if (status === 200) {
        for (let team of data) {
          try {
            await Team.create({
              apiId: team["GlobalTeamID"],
              name: team["Name"],
              key: team["Key"],
              location: team["City"],
              sport: SportType.MLB,
              primaryColor: `#${team["PrimaryColor"]}`,
              secondaryColor: `#${team["SecondaryColor"]}`,
            }).save()
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("MLB Teams Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(`MLB Teams Data: ${teamsCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)

    const athletesCount = await Athlete.count({
      where: { team: { sport: SportType.MLB } },
    })

    if (athletesCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/Players?key=${process.env.SPORTS_DATA_MLB_KEY}`)

      if (status === 200) {
        for (let athlete of data) {
          try {
            const team = await Team.findOneOrFail({
              where: { apiId: athlete["GlobalTeamID"] },
            })

            var options = { compact: true, ignoreComment: true, spaces: 4 }
            var result: any = convert.xml2js(ATHLETE_MLB_IMG, options)

            result.svg.path[10]["_attributes"]["fill"] = team.primaryColor
            result.svg.path[9]["_attributes"]["fill"] = team.secondaryColor
            result.svg.g[0].text[0]["_text"] = athlete["FirstName"].toUpperCase()
            result.svg.g[0].text[1]["_text"] = athlete["LastName"].toUpperCase()
            result.svg.g[0].text[2]["_text"] = athlete["Position"].toUpperCase()
            result.svg.text["_text"] = athlete["Jersey"] ? athlete["Jersey"] : "00"

            result = convert.js2xml(result, options)
            var buffer = Buffer.from(result, "utf8")
            const s3 = new S3({
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            })
            const filename = `${athlete["PlayerID"]}.svg`
            const s3_location = "media/athlete/mlb/"
            const fileContent = buffer
            const params: any = {
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: `${s3_location}${filename}`,
              Body: fileContent,
              ContentType: "image/svg+xml",
              CacheControl: "no-cache",
            }

            s3.upload(params, async (err: any, data: any) => {
              if (err) {
                this.logger.error(err)
              } else {
                const nftImage = data["Location"]

                const baseImage = ATHLETE_MLB_BASE_IMG
                var options = { compact: true, ignoreComment: true, spaces: 4 }
                var result: any = convert.xml2js(baseImage, options)

                result["svg"]["g"]["4"]["g"][3]["text"][0]["tspan"]["_cdata"] = athlete["FirstName"].toUpperCase()
                result["svg"]["g"]["4"]["g"][3]["g"]["text"][0]["tspan"]["_cdata"] = athlete["FirstName"].toUpperCase()
                result["svg"]["g"][4]["g"][3]["text"][1]["tspan"]["_cdata"] = athlete["LastName"].toUpperCase()
                result["svg"]["g"][4]["g"][3]["g"]["text"][1]["tspan"]["_cdata"] = athlete["LastName"].toUpperCase()
                result["svg"]["g"][1]["g"][2]["g"]["path"]["_attributes"]["fill"] = team.primaryColor
                result["svg"]["g"][1]["g"][0]["g"]["path"]["_attributes"]["fill"] = team.secondaryColor
                result["svg"]["g"][4]["g"][2]["g"]["text"]["tspan"]["_cdata"] = athlete["Jersey"] ? athlete["Jersey"].toString() : "00"
                result["svg"]["g"][4]["g"][0]["g"]["g"]["text"]["tspan"]["_cdata"] = athlete["Position"].toUpperCase()

                const animation = convert.js2xml(result, options)
                result = animation.replace("</svg>", ATHLETE_MLB_BASE_ANIMATION)
                var buffer = Buffer.from(result, "utf8")
                const s3 = new S3({
                  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                })
                const filename = `${athlete["PlayerID"]}.svg`
                const s3_location = "media/athlete_animations/mlb/"
                const fileContent = buffer
                const params: any = {
                  Bucket: process.env.AWS_BUCKET_NAME,
                  Key: `${s3_location}${filename}`,
                  Body: fileContent,
                  ContentType: "image/svg+xml",
                  CacheControl: "no-cache",
                }

                s3.upload(params, async (err: any, data: any) => {
                  if (err) {
                    this.logger.error(err)
                  } else {
                    await Athlete.create({
                      apiId: athlete["PlayerID"],
                      firstName: athlete["FirstName"],
                      lastName: athlete["LastName"],
                      position: athlete["Position"],
                      salary: athlete["Salary"],
                      jersey: athlete["Jersey"],
                      team,
                      isActive: athlete["Status"] === "Active",
                      isInjured: athlete["InjuryStatus"],
                      nftImage,
                      nftAnimation: data["Location"],
                    }).save()
                  }
                })
              }
            })
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("MLB Athletes Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(`MLB Athletes Data: ${athletesCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)
  }

  //@Timeout(1)
  async syncMlbData2(){
    const teamCount = await Team.count({
      where: { sport: SportType.MLB},
    })

    if (teamCount === 0){ //init mlb teams
      const {data, status} = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/teams?key=${process.env.SPORTS_DATA_MLB_KEY}`)

      if (status === 200) {
        for (let team of data){
          try {
            await Team.create({
              apiId: team["GlobalTeamID"],
              name: team["Name"],
              key: team["Key"],
              location: team["City"],
              sport: SportType.MLB,
              primaryColor: `#${team["PrimaryColor"]}`,
              secondaryColor: `#${team["SecondaryColor"]}`,
            }).save()
          } catch(err){
            this.logger.error(err)
          }
        }
      } else{
        this.logger.error("MLB Teams Data: SPORTS DATA ERROR")
      }
    }
    this.logger.debug(`MLB Teams: ${teamCount ? "ALREADY EXISTS" : "SYNCED"}`)

    const athleteCount = await Athlete.count({
      where: { team: { sport: SportType.MLB } },
    })

    if (athleteCount === 0){
      const {data, status} = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/Players?key=${process.env.SPORTS_DATA_MLB_KEY}`)
      if (status === 200){
        for (let athlete of data){
          if(MLB_ATHLETE_IDS.includes(athlete["PlayerID"])){
            try {
              const team = await Team.findOne({
                where: {apiId: athlete["GlobalTeamID"]},
              })
  
              if(team){
                await Athlete.create({
                  apiId: athlete["PlayerID"],
                  firstName: athlete["FirstName"],
                  lastName: athlete["LastName"],
                  position: athlete["Position"],
                  jersey: athlete["Jersey"],
                  team,
                  isActive: athlete["Status"] === "Active",
                  isInjured: athlete["InjuryStatus"],
                }).save()
              }
            } catch(err){
              this.logger.error(err)
            }
          }
          
        }
      } else{
        this.logger.error("MLB Athlete: SPORTS DATA ERROR")
      }
        
      
    } else{
      const {data, status} = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/Players?key=${process.env.SPORTS_DATA_MLB_KEY}`)
      if (status === 200){
        const newAthlete: Athlete[] = []
        const updateAthlete: Athlete[] = []
        for (let athlete of data){

            
              try {
                const team = await Team.findOne({
                  where: {apiId: athlete["GlobalTeamID"]},
                })
                
                if(team){
  
                  const currAthlete = await Athlete.findOne({
                    where: {apiId: athlete["PlayerID"]}
                  })
  
                  if(currAthlete){
                    currAthlete.firstName = athlete["FirstName"]
                    currAthlete.lastName = athlete["LastName"]
                    currAthlete.position = athlete["Position"] !== null ? athlete["Position"] : "N/A"
                    currAthlete.jersey = athlete["Jersey"]
                    currAthlete.isActive = athlete["Status"] === "Active"
                    currAthlete.isInjured = athlete["InjuryStatus"]
                    updateAthlete.push(currAthlete)
                  } else{
                    newAthlete.push(
                      Athlete.create({
                        apiId: athlete["PlayerID"],
                        firstName: athlete["FirstName"],
                        lastName: athlete["LastName"],
                        position: athlete["Position"] !== null ? athlete["Position"] : "N/A",
                        jersey: athlete["Jersey"],
                        team,
                        isActive: athlete["Status"] === "Active",
                        isInjured: athlete["InjuryStatus"],
                      })
                    )
                  }
                  
                }
              } catch(err){
                this.logger.error(err)
              }
            
            
          
          
        }
        await Athlete.save([...newAthlete, ...updateAthlete], {chunk: 20})
        this.logger.debug("MLB Athlete: UPDATED ")

        const athleteCount = await Athlete.count({
          where: {team: { sport: SportType.MLB}}
        })
        this.logger.debug("CURRENT MLB ATHLETE COUNT: " + athleteCount)
      } else{
        this.logger.error("MLB Athlete: SPORTS DATA ERROR")
      }
    }
    this.logger.debug(`MLB Athlete: ${athleteCount ? 'ALREADY EXISTS' : 'SYNCED'}`)
  }
  //@Timeout(1)
  async syncNflData() {
    const teamsCount = await Team.count({
      where: { sport: SportType.NFL },
    })

    if (teamsCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Teams?key=${process.env.SPORTS_DATA_NFL_KEY}`)

      if (status === 200) {
        for (let team of data) {
          try {
            await Team.create({
              apiId: team["GlobalTeamID"],
              name: team["Name"],
              key: team["Key"],
              location: team["City"],
              sport: SportType.NFL,
              primaryColor: `#${team["PrimaryColor"]}`,
              secondaryColor: `#${team["SecondaryColor"]}`,
            }).save()
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("NFL Teams Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(`NFL Teams Data: ${teamsCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)

    const athletesCount = await Athlete.count({
      where: { team: { sport: SportType.NFL } },
    })

    if (athletesCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Players?key=${process.env.SPORTS_DATA_NFL_KEY}`)

      if (status === 200) {
        for (let athlete of data) {
          try {
            const team = await Team.findOne({
              where: { apiId: athlete["GlobalTeamID"] },
            })

            if (team) {
              var svgTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-templates/${team.key}.svg`, "utf-8")
              var options = { compact: true, ignoreComment: true, spaces: 4 }
              var result: any = convert.xml2js(svgTemplate, options)

              try {
                result.svg.g[5].text[2]["_text"] = athlete["FirstName"].toUpperCase()
                result.svg.g[5].text[3]["_text"] = athlete["LastName"].toUpperCase()
                result.svg.g[5].text[1]["_text"] = athlete["Position"].toUpperCase()
                result.svg.g[5].text[0]["_text"] = ""
              } catch (e) {
                console.log(`FAILED AT ATHLETE ID: ${athlete["PlayerID"]} and TEAM KEY: ${team.key}`)
              }

              result = convert.js2xml(result, options)
              // fs.writeFileSync(
              //   `./nfl-images/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
              //     "LastName"
              //   ].toLowerCase()}.svg`,
              //   result
              // )
              var buffer = Buffer.from(result, "utf8")
              const s3 = new S3({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              })
              const filename = `${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete["LastName"].toLowerCase()}.svg`
              const s3_location = "media/athlete/nfl/images/"
              const fileContent = buffer
              const params: any = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `${s3_location}${filename}`,
                Body: fileContent,
                ContentType: "image/svg+xml",
                CacheControl: "no-cache",
              }

              s3.upload(params, async (err: any, data: any) => {
                if (err) {
                  this.logger.error(err)
                } else {
                  const nftImage = data["Location"]

                  var svgAnimationTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-animation-templates/${team.key}.svg`, "utf-8")
                  var options = { compact: true, ignoreComment: true, spaces: 4 }
                  var result: any = convert.xml2js(svgAnimationTemplate, options)

                  try {
                    result.svg.g[5].text[0].tspan["_cdata"] = ""
                    result.svg.g[5].text[1].tspan["_cdata"] = ""
                    result.svg.g[5].text[2].tspan["_cdata"] = athlete["FirstName"].toUpperCase()
                    result.svg.g[5].text[3].tspan["_cdata"] = athlete["FirstName"].toUpperCase()
                    result.svg.g[5].text[4].tspan["_cdata"] = athlete["LastName"].toUpperCase()
                    result.svg.g[5].text[5].tspan["_cdata"] = athlete["LastName"].toUpperCase()
                    result.svg.g[5].g[0].text[0].tspan["_cdata"] = athlete["Position"].toUpperCase()
                    result.svg.g[5].g[0].text[1].tspan["_cdata"] = athlete["Position"].toUpperCase()
                    result = convert.js2xml(result, options)
                  } catch (e) {
                    console.log(`FAILED AT ATHLETE ID: ${athlete["PlayerID"]} and TEAM KEY: ${team.key}`)
                    console.log(e)
                  }

                  // fs.writeFileSync(
                  //   `./nfl-animations/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
                  //     "LastName"
                  //   ].toLowerCase()}.svg`,
                  //   result
                  // )
                  var buffer = Buffer.from(result, "utf8")
                  const s3 = new S3({
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                  })
                  const filename = `${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete["LastName"].toLowerCase()}.svg`
                  const s3_location = "media/athlete/nfl/animations/"
                  const fileContent = buffer
                  const params: any = {
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `${s3_location}${filename}`,
                    Body: fileContent,
                    ContentType: "image/svg+xml",
                    CacheControl: "no-cache",
                  }

                  s3.upload(params, async (err: any, data: any) => {
                    if (err) {
                      this.logger.error(err)
                    } else {
                      await Athlete.create({
                        apiId: athlete["PlayerID"],
                        firstName: athlete["FirstName"],
                        lastName: athlete["LastName"],
                        position: athlete["Position"],
                        jersey: athlete["Number"],
                        team,
                        isActive: athlete["Status"] === "Active",
                        isInjured: athlete["InjuryStatus"],
                        nftImage,
                        nftAnimation: data["Location"],
                      }).save()
                    }
                  })
                }
              })
            }
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("NFL Athletes Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(`NFL Athletes Data: ${athletesCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)
  }

  //@Timeout(1)
  async syncNbaData() {
    const teamsCount = await Team.count({
      where: { sport: SportType.NBA },
    })

    if (teamsCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/AllTeams?key=${process.env.SPORTS_DATA_NBA_KEY}`)

      if (status === 200) {
        for (let team of data) {
          try {
            await Team.create({
              apiId: team["GlobalTeamID"],
              name: team["Name"],
              key: team["Key"],
              location: team["City"],
              sport: SportType.NBA,
              primaryColor: `#${team["PrimaryColor"]}`,
              secondaryColor: `#${team["SecondaryColor"]}`,
            }).save()
          } catch (e) {
            this.logger.error(e)
          }
        }
      } else {
        this.logger.error("NBA Teams Data: SPORTS DATA ERROR")
      }
    }

    this.logger.debug(`NBA Teams Data: ${teamsCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)

    const athletesCount = await Athlete.count({
      where: { team: { sport: SportType.NBA } },
    })

    if (athletesCount === 0) {
      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/Players?key=${process.env.SPORTS_DATA_NBA_KEY}`)

      if (status === 200) {
        for (let athlete of data) {
          try {
            const team = await Team.findOne({
              where: { apiId: athlete["GlobalTeamID"] },
            })

            if (team) {
              await Athlete.create({
                apiId: athlete["PlayerID"],
                firstName: athlete["FirstName"],
                lastName: athlete["LastName"],
                position: athlete["Position"],
                jersey: athlete["Jersey"],
                team,
                isActive: athlete["Status"] === "Active",
                isInjured: athlete["InjuryStatus"],
              }).save()
            }
          } catch (e) {
            this.logger.error(e)
          }
        }
      }
    }

    this.logger.debug(`NBA Athletes Data: ${athletesCount ? "DID NOT SYNC" : "SYNCED SUCCESSFULLY"}`)
  }

  // @Timeout(1)
  async generateAthleteNflAssets() {
    this.logger.debug("Generate Athlete NFL Assets: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NFL } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[5].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[5].text[3]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[5].text[2]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[5].text[3]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[5].text[1]["_text"] = athlete.position.toUpperCase()
        result.svg.g[5].text[0]["_text"] = ""
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nfl-images/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
      //     "LastName"
      //   ].toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nfl/images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          const nftImage = data["Location"]
          athlete.nftImage = nftImage

          var svgAnimationTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-animation-templates/${athlete.team.key}.svg`, "utf-8")
          var options = { compact: true, ignoreComment: true, spaces: 4 }
          var result: any = convert.xml2js(svgAnimationTemplate, options)

          try {
            if (athlete.firstName.length > 11) {
              result.svg.g[5].text[2].tspan["_attributes"]["font-size"] = "50"
              result.svg.g[5].text[3].tspan["_attributes"]["font-size"] = "50"
            }
            if (athlete.lastName.length > 11) {
              result.svg.g[5].text[4].tspan["_attributes"]["font-size"] = "50"
              result.svg.g[5].text[5].tspan["_attributes"]["font-size"] = "50"
            }

            result.svg.g[5].text[0].tspan["_cdata"] = ""
            result.svg.g[5].text[1].tspan["_cdata"] = ""
            result.svg.g[5].text[2].tspan["_cdata"] = athlete.firstName.toUpperCase()
            result.svg.g[5].text[3].tspan["_cdata"] = athlete.firstName.toUpperCase()
            result.svg.g[5].text[4].tspan["_cdata"] = athlete.lastName.toUpperCase()
            result.svg.g[5].text[5].tspan["_cdata"] = athlete.lastName.toUpperCase()
            result.svg.g[5].g[0].text[0].tspan["_cdata"] = athlete.position.toUpperCase()
            result.svg.g[5].g[0].text[1].tspan["_cdata"] = athlete.position.toUpperCase()
            result = convert.js2xml(result, options)
          } catch (e) {
            console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
            console.log(e)
          }

          // fs.writeFileSync(
          //   `./nfl-animations/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
          //     "LastName"
          //   ].toLowerCase()}.svg`,
          //   result
          // )
          var buffer = Buffer.from(result, "utf8")
          const s3 = new S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          })
          const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
          const s3_location = "media/athlete/nfl/animations/"
          const fileContent = buffer
          const params: any = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `${s3_location}${filename}`,
            Body: fileContent,
            ContentType: "image/svg+xml",
            CacheControl: "no-cache",
          }

          s3.upload(params, async (err: any, data: any) => {
            if (err) {
              this.logger.error(err)
            } else {
              athlete.nftAnimation = data["Location"]
              await Athlete.save(athlete)
            }
          })
        }
      })
    }

    this.logger.debug("Generate Athlete NFL Assets: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  @Timeout(1)
  async syncNearData(){ //for mainnet 
    const lakeConfig: types.LakeConfig = {
      //credentials
      s3BucketName: "near-lake-data-mainnet",
      s3RegionName: "eu-central-1",
      startBlockHeight: 97239921,
    }
    let count = 0
    async function handleStreamerMessage(streamerMessage: types.StreamerMessage): Promise<void>{
      // console.log(`
      // Block #${streamerMessage.block.header.height}
      // Shards: ${streamerMessage.shards.length
      // }`)
      console.log(count)
      count = +count + +1
      for(let shard of streamerMessage.shards){
        if(shard.chunk !== undefined){
          // let filteredReceipts = shard.chunk.receipts.filter((x) => x.receiverId === 'game.baseball.playible.near')
          // for (let receipt of filteredReceipts){
          //   let method = receipt.receipt.actions[]
          // }
          let filteredTrxns = shard.chunk.transactions.filter((x) => x.transaction.receiverId === 'game.baseball.playible.near')
          for (let transaction of filteredTrxns){
            console.log("Playible contract found")
            console.log(JSON.parse(transaction.transaction.actions[0].toString()))
            const action = JSON.parse(transaction.transaction.actions[0].toString())
            const args = JSON.parse(Buffer.from(action, 'base64').toString())
          }
        }
      }
      console.log(``)
    }

    await startStream(lakeConfig, handleStreamerMessage)
  }
  // @Timeout(1)
  async generateAthleteNbaAssets() {
    this.logger.debug("Generate Athlete NBA Assets: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nba-svg-teams-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")

      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nba/images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImage = data["Location"]

          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NBA Assets: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  //@Timeout(300000)
  async generateAthleteMlbAssets() {
    this.logger.debug("Generate Athlete MLB Assets: STARTED")

    const athletes = await Athlete.find({
      where: { 
        apiId: In(MLB_ATHLETE_IDS),
        team: { sport: SportType.MLB }},
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/mlb-svg-teams-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")

      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/mlb/images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImage = data["Location"]

          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete MLB Assets: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  //@Timeout(300000)
  async generateAthleteCricketAssets(){
    this.logger.debug("Generate Athlete Cricket Assets: STARTED")

    const athletes = await CricketAthlete.find({
      where: {
        playerKey: In(IPL2023_ATHLETE_IDS),
        cricketTeam: { sport: SportType.CRICKET},
      },
      relations: {
        cricketTeam: true
      }
    })

    for (let athlete of athletes ){
      var svgTemplate = fs.readFileSync(`./src/utils/cricket-svg-teams-templates/${athlete.cricketTeam.key.toUpperCase()}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4}
      var result: any = convert.xml2js(svgTemplate, options)
      const name = athlete.name.split(/ (.*)/, 2)
      const firstName = name[0]
      const lastName = name[1]
      try {

        if (firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        let position: string = ""
        switch(athlete.seasonalRole){
          case "bowler": position = "BOWL"; break
          case "batsman": position = "BAT"; break
          case "all_rounder": position = "AR"; break;
          case "keeper": position = "WK"; break;
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = position
      } catch (e){
        this.logger.debug(`FAILED AT ATHLETE KEY: ${athlete.playerKey} and TEAM KEY: ${athlete.cricketTeam.key}`)
      }

      result = convert.js2xml(result, options)

      // fs.writeFileSync(
      //   `./cricket-images/${athlete.playerKey}-${firstName.toLowerCase()}-${lastName.toLowerCase()}.svg`,
      //   result
      // )
      
      var buffer = Buffer.from(result, "utf8")

      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.playerKey}-${firstName.toLowerCase()}-${lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/ipl/images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if(err){
          this.logger.error(err)
        } else{
          athlete.nftImage = data["Location"]
          await CricketAthlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete Cricket Assets: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  async generateAthleteNbaAssetsAnimation() {
    this.logger.debug("Generate Athlete NBA Assets Animation: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgAnimationTemplate = fs.readFileSync(`./src/utils/nba-svg-teams-animation-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgAnimationTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[4].text[2].tspan["_attributes"]["font-size"] = "50"
          result.svg.g[4].text[3].tspan["_attributes"]["font-size"] = "50"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[4].text[4].tspan["_attributes"]["font-size"] = "50"
          result.svg.g[4].text[5].tspan["_attributes"]["font-size"] = "50"
        }

        result.svg.g[4].text[0].tspan["_text"] = athlete.position.toUpperCase()
        result.svg.g[4].text[1].tspan["_text"] = athlete.position.toUpperCase()
        result.svg.g[4].text[2].tspan["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[4].text[3].tspan["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[4].text[4].tspan["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[4].text[5].tspan["_text"] = athlete.lastName.toUpperCase()
        result = convert.js2xml(result, options)
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
        console.log(e)
      }

      // fs.writeFileSync(
      //   `./nfl-animations/${athlete["PlayerID"]}-${athlete["FirstName"].toLowerCase()}-${athlete[
      //     "LastName"
      //   ].toLowerCase()}.svg`,
      //   result
      // )
      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nba/animations/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftAnimation = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NBA Assets Animations: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  //@Timeout(450000)
  async generateAthleteMlbAssetsAnimation() {
    this.logger.debug("Generate Athlete MLB Assets Animation: STARTED")

    const athletes = await Athlete.find({
      where: {
        apiId: In(MLB_ATHLETE_IDS), 
        team: { sport: SportType.MLB } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgAnimationTemplate = fs.readFileSync(`./src/utils/mlb-svg-teams-animation-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgAnimationTemplate, options)


      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[4].text[2].tspan["_attributes"]["font-size"] = "50"
          result.svg.g[4].text[3].tspan["_attributes"]["font-size"] = "50"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[4].text[4].tspan["_attributes"]["font-size"] = "50"
          result.svg.g[4].text[5].tspan["_attributes"]["font-size"] = "50"
        }

        result.svg.g[4].text[0].tspan["_cdata"] = athlete.position.toUpperCase()
        result.svg.g[4].text[1].tspan["_cdata"] = athlete.position.toUpperCase()
        result.svg.g[4].text[2].tspan["_cdata"] = athlete.firstName.toUpperCase()
        result.svg.g[4].text[3].tspan["_cdata"] = athlete.firstName.toUpperCase()
        result.svg.g[4].text[4].tspan["_cdata"] = athlete.lastName.toUpperCase()
        result.svg.g[4].text[5].tspan["_cdata"] = athlete.lastName.toUpperCase()
        result = convert.js2xml(result, options)
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
        console.log(e)
      }

      // fs.writeFileSync(
      //   `./nfl-animations/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName
      //   .toLowerCase()}.svg`,
      //   result
      // )
      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/mlb/animations/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftAnimation = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete MLB Assets Animations: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  //@Timeout(450000)
  async generateAthleteCricketAssetsAnimation(){
    this.logger.debug("Generate Athlete Cricket Assets Animation: STARTED")

    const athletes = await CricketAthlete.find({
      where: {
        playerKey: In(IPL2023_ATHLETE_IDS),
        cricketTeam: { sport: SportType.CRICKET},
      },
      relations: {
        cricketTeam: true
      }
    })

    for (let athlete of athletes) {
      var svgAnimationTemplate = fs.readFileSync(`./src/utils/cricket-svg-teams-animation-templates/${athlete.cricketTeam.key.toUpperCase()}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4}
      var result: any = convert.xml2js(svgAnimationTemplate, options)

      const name = athlete.name.split(/ (.*)/, 2)
      const firstName = name[0]
      const lastName = name[1]

      try {
        if (firstName.length > 11) {
          result.svg.g[4].text[2].tspan["_attributes"]["font-size"] = "50"
          result.svg.g[4].text[3].tspan["_attributes"]["font-size"] = "50"
        }
        if (lastName.length > 11) {
          result.svg.g[4].text[4].tspan["_attributes"]["font-size"] = "50"
          result.svg.g[4].text[5].tspan["_attributes"]["font-size"] = "50"
        }

        let position: string = ""
        switch(athlete.seasonalRole){
          case "bowler": position = "BOWL"; break
          case "batsman": position = "BAT"; break
          case "all_rounder": position = "AR"; break;
          case "keeper": position = "WK"; break;
        }

        result.svg.g[4].text[0].tspan["_cdata"] = position //check if template is cdata or text
        result.svg.g[4].text[1].tspan["_cdata"] = position
        result.svg.g[4].text[2].tspan["_cdata"] = firstName.toUpperCase()
        result.svg.g[4].text[3].tspan["_cdata"] = firstName.toUpperCase()
        result.svg.g[4].text[4].tspan["_cdata"] = lastName.toUpperCase()
        result.svg.g[4].text[5].tspan["_cdata"] = lastName.toUpperCase()
        result = convert.js2xml(result, options)
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.playerKey} and TEAM KEY: ${athlete.cricketTeam.key}`)
        console.log(e)
      }

      // fs.writeFileSync(
      //   `./cricket-images/${athlete.playerKey}-${firstName.toLowerCase()}-${lastName.toLowerCase()}-anim.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.playerKey}-${firstName.toLowerCase()}-${lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/ipl/animations/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }
      s3.upload(params, async (err: any, data: any) => {
        if (err){
          this.logger.error(err)
        } else{
          athlete.nftAnimation = data["Location"]
          await CricketAthlete.save(athlete)
        }
      })
    }
    this.logger.debug("Generate Athlete Cricket Assets Animations: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  async generateAthleteNbaAssetsPromo() {
    this.logger.debug("Generate Athlete NBA Assets Promo: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nba-svg-teams-promo-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images-promo/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nba/promo_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImagePromo = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NBA Assets Promo: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  async generateAthleteNflAssetsPromo() {
    this.logger.debug("Generate Athlete NFL Assets Promo: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NFL } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-promo-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[5].text[1]["_attributes"]["style"] = "fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[5].text[2]["_attributes"]["style"] = "fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;"
        }

        result.svg.g[5]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[5]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[5]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nfl-images-promo/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nfl/promo_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImagePromo = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NFL Assets Promo: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  //@Timeout(600000)
  async generateAthleteMlbAssetsPromo() {
    this.logger.debug("Generate Athlete MLB Assets Promo: STARTED")

    const athletes = await Athlete.find({
      where: {
        apiId: In(MLB_ATHLETE_IDS), 
        team: { sport: SportType.MLB } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/mlb-svg-teams-promo-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images-promo/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/mlb/promo_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImagePromo = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete MLB Assets Promo: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }
  
  //@Timeout(300000)
  async generateAthleteCricketAssetsPromo(){
    this.logger.debug("Generate Athlete Cricket Assets Promo: STARTED")

    const athletes = await CricketAthlete.find({
      where: {
        playerKey: In(IPL2023_ATHLETE_IDS),
        cricketTeam: { sport: SportType.CRICKET},
      },
      relations: {
        cricketTeam: true,
      }
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/cricket-svg-teams-promo-templates/${athlete.cricketTeam.key.toUpperCase()}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      const name = athlete.name.split(/ (.*)/, 2)
      const firstName = name[0]
      const lastName = name[1]

      try {
        if (firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        let position: string = ""
        switch(athlete.seasonalRole){
          case "bowler": position = "BOWL"; break
          case "batsman": position = "BAT"; break
          case "all_rounder": position = "AR"; break;
          case "keeper": position = "WK"; break;
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = position
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.playerKey} and TEAM KEY: ${athlete.cricketTeam.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images-promo/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.playerKey}-${firstName.toLowerCase()}-${lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/ipl/promo_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImagePromo = data["Location"]
          await CricketAthlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete Cricket Assets Promo: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }
  // @Timeout(1)
  async generateAthleteNflAssetsLocked() {
    this.logger.debug("Generate Athlete NFL Assets Locked: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NFL } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nfl-svg-teams-lock-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[5].text[1]["_attributes"]["style"] = "fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[5].text[2]["_attributes"]["style"] = "fill:#fff; font-family:Arimo-Bold, Arimo; font-size:50px;"
        }

        result.svg.g[5]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[5]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[5]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nfl-images-locked/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nfl/locked_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImageLocked = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NFL Assets Locked: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  async generateAthleteNbaAssetsLocked() {
    this.logger.debug("Generate Athlete NBA Assets Locked: STARTED")

    const athletes = await Athlete.find({
      where: { team: { sport: SportType.NBA } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/nba-svg-teams-lock-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images-locked/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/nba/locked_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImageLocked = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete NBA Assets Locked: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  //@Timeout(750000)
  async generateAthleteMlbAssetsLocked() {
    this.logger.debug("Generate Athlete MLB Assets Locked: STARTED")

    const athletes = await Athlete.find({
      where: {
        apiId: In(MLB_ATHLETE_IDS), 
        team: { sport: SportType.MLB } },
      relations: {
        team: true,
      },
    })

    for (let athlete of athletes) {
      var svgTemplate = fs.readFileSync(`./src/utils/mlb-svg-teams-lock-templates/${athlete.team.key}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      try {
        if (athlete.firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (athlete.lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        result.svg.g[6]["text"][1]["tspan"]["_text"] = athlete.firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = athlete.lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = athlete.position.toUpperCase()
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.apiId} and TEAM KEY: ${athlete.team.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images-locked/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/mlb/locked_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImageLocked = data["Location"]
          await Athlete.save(athlete)
        }
      })
    }

    this.logger.debug("Generate Athlete MLB Assets Locked: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  //@Timeout(450000)
  async generateAthleteCricketAssetsLocked(){
    this.logger.debug("Generate Athlete Cricket Assets Locked: STARTED")

    const athletes = await CricketAthlete.find({
      where: {
        playerKey: In(IPL2023_ATHLETE_IDS),
        cricketTeam: { sport: SportType.CRICKET }
      },
      relations: {
        cricketTeam: true,
      }
    })

    for(let athlete of athletes){
      var svgTemplate = fs.readFileSync(`./src/utils/cricket-svg-teams-lock-templates/${athlete.cricketTeam.key.toUpperCase()}.svg`, "utf-8")
      var options = { compact: true, ignoreComment: true, spaces: 4 }
      var result: any = convert.xml2js(svgTemplate, options)

      const name = athlete.name.split(/ (.*)/, 2)
      const firstName = name[0]
      const lastName = name[1]

      try {
        if (firstName.length > 11) {
          result.svg.g[6].text[1]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }
        if (lastName.length > 11) {
          result.svg.g[6].text[2]["_attributes"]["style"] = "font-size:50px;fill:#fff;font-family:Arimo-Bold, Arimo;font-weight:700"
        }

        let position: string = ""
        switch(athlete.seasonalRole){
          case "bowler": position = "BOWL"; break
          case "batsman": position = "BAT"; break
          case "all_rounder": position = "AR"; break;
          case "keeper": position = "WK"; break;
        }
        result.svg.g[6]["text"][1]["tspan"]["_text"] = firstName.toUpperCase()
        result.svg.g[6]["text"][2]["tspan"]["_text"] = lastName.toUpperCase()
        result.svg.g[6]["text"][0]["tspan"]["_text"] = position
      } catch (e) {
        console.log(`FAILED AT ATHLETE ID: ${athlete.playerKey} and TEAM KEY: ${athlete.cricketTeam.key}`)
      }

      result = convert.js2xml(result, options)
      // fs.writeFileSync(
      //   `./nba-images-locked/${athlete.apiId}-${athlete.firstName.toLowerCase()}-${athlete.lastName.toLowerCase()}.svg`,
      //   result
      // )

      var buffer = Buffer.from(result, "utf8")
      const s3 = new S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      })
      const filename = `${athlete.playerKey}-${firstName.toLowerCase()}-${lastName.toLowerCase()}.svg`
      const s3_location = "media/athlete/ipl/locked_images/"
      const fileContent = buffer
      const params: any = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${s3_location}${filename}`,
        Body: fileContent,
        ContentType: "image/svg+xml",
        CacheControl: "no-cache",
      }

      s3.upload(params, async (err: any, data: any) => {
        if (err) {
          this.logger.error(err)
        } else {
          athlete.nftImageLocked = data["Location"]
          await CricketAthlete.save(athlete)
        }
      })
    }
    
    this.logger.debug("Generate Athlete Cricket Assets Locked: FINISHED")
    this.logger.debug(`TOTAL ATHLETES: ${athletes.length}`)
  }

  // @Timeout(1)
  ////@Interval(900000) // Runs every 15 mins
  async updateNflAthleteStatsPerSeason() {
    this.logger.debug("Update NFL Athlete Stats: STARTED")

    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0]

      if (timeFrame) {
        // const season = new Date().getFullYear() - 1
        const season = timeFrame.ApiSeason

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

          this.logger.debug("Update NFL Athlete Stats: FINISHED")
        } else {
          this.logger.error("NFL Athlete Stats Data: SPORTS DATA ERROR")
        }
      }
    } else {
      this.logger.error("NFL Timeframes Data: SPORTS DATA ERROR")
    }
  }

  
  ////@Interval(300000) // Runs every 5 mins
  async updateNflAthleteStatsPerWeek() {
    this.logger.debug("Update NFL Athlete Stats Per Week: STARTED")

    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0]

      if (timeFrame) {
        // const season = new Date().getFullYear() - 1
        const season = timeFrame.ApiSeason
        const week = timeFrame.ApiWeek ? timeFrame.ApiWeek : "1"

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerGameStatsByWeek/${season}/${week}?key=${process.env.SPORTS_DATA_NFL_KEY}`
        )

        if (status === 200) {
          const newStats: AthleteStat[] = []
          const updateStats: AthleteStat[] = []

          for (let athleteStat of data) {
            const apiId: number = athleteStat["PlayerID"]
            const curStat = await AthleteStat.findOne({
              where: { athlete: { apiId }, season: season, week: week, type: AthleteStatType.WEEKLY },
              relations: {
                athlete: true,
              },
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
              updateStats.push(curStat)
            } else {
              const curAthlete = await Athlete.findOne({
                where: { apiId },
              })

              const opponent = await Team.findOne({
                where: { key: athleteStat["Opponent"] },
              })

              if (curAthlete) {
                newStats.push(
                  AthleteStat.create({
                    athlete: curAthlete,
                    season: season,
                    week: week,
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

          this.logger.debug("Update NFL Athlete Stats Per Week: FINISHED")
        } else {
          this.logger.error("NFL Athlete Stats Data: SPORTS DATA ERROR")
        }
      }
    } else {
      this.logger.error("NFL Timeframes Data: SPORTS DATA ERROR")
    }
  }
  ////@Interval(3600000) //runs every 1 hour
  async updateNflAthleteInjuryStatus(){
    this.logger.debug("Update NFL Athlete Injury Status: STARTED")

    const {data, status} = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Players?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if (status === 200){
      const updateAthlete: Athlete[] = []
      for (let athlete of data){
        const apiId: number = athlete["PlayerID"]
        const curAthlete = await Athlete.findOne({
          where: { apiId: apiId },
        })

        if (curAthlete){
          curAthlete.isInjured = athlete["InjuryStatus"]
          updateAthlete.push(curAthlete)
        } 

        await Athlete.save(updateAthlete, {chunk: 20})

        
      }
      this.logger.debug("Update NFL Injury Status: FINISHED")
    } else{
      this.logger.error("NFL Athlete Injury Data: SPORTS DATA ERROR")
    }
  }
  ////@Interval(3600000) //runs every 1 hour
  async updateNbaAthleteInjuryStatus(){
    this.logger.debug("Update NBA Athlete Injury Status: STARTED")

    const {data, status} = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/Players?key=${process.env.SPORTS_DATA_NBA_KEY}`)

    if (status === 200){
      const updateAthlete: Athlete[] = []
      for (let athlete of data){
        const apiId: number = athlete["PlayerID"]
        const curAthlete = await Athlete.findOne({
          where: { apiId: apiId },
        })

        if (curAthlete){
          curAthlete.isInjured = athlete["InjuryStatus"]
          updateAthlete.push(curAthlete)
        } 

        
      }
      await Athlete.save(updateAthlete, {chunk: 20}) 
      this.logger.debug("Update NBA Injury Status: FINISHED")
    } else{
      this.logger.error("NBA Athlete Injury Data: SPORTS DATA ERROR")
    }
  }

  ////@Interval(3600000) // runs every 1 hour
  async updateMlbAthleteInjuryStatus(){
    this.logger.debug("Update MLB Athlete Injury Status: STARTED")

    const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/Players?key=${process.env.SPORTS_DATA_MLB_KEY}`)

    if (status === 200){
      const updateAthlete: Athlete[] = []
      for (let athlete of data){
        const apiId: number = athlete["PlayerID"]
        const curAthlete = await Athlete.findOne({
          where: { apiId: apiId},
        })
        if (curAthlete){
          curAthlete.isInjured = athlete["InjuryStatus"]
          updateAthlete.push(curAthlete)
        }

      }
      await Athlete.save(updateAthlete, { chunk: 20})
      this.logger.debug("Update NBA Injury Status: FINISHED")
    } else{
      this.logger.error("NBA Athlete Injury Data: SPORTS DATA ERROR")
    }
  }

  //@Timeout(1)
  async updateNflAthleteStatsAllWeeks() {
    this.logger.debug("Update NFL Athlete Stats All Weeks: STARTED")

    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0]

      if (timeFrame) {
        // const season = new Date().getFullYear() - 1
        // const season = timeFrame.ApiSeason
        // const week = timeFrame.ApiWeek ? timeFrame.ApiWeek : "1"
        const season = "2022PLAY"
        const week = "18"

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

            this.logger.debug(`Update NFL Athlete Stats Week ${curWeek}: FINISHED`)
          } else {
            this.logger.error("NFL Athlete Stats Data: SPORTS DATA ERROR")
          }
        }
      }
    } else {
      this.logger.error("NFL Timeframes Data: SPORTS DATA ERROR")
    }

    this.logger.debug("Update NFL Athlete Stats All Weeks: FINISHED")
  }

  // @Cron("55 11 * * *", {
  //   name: "updateNflTeamScores",
  //   timeZone: "Asia/Manila",
  // })
  async updateNflTeamScores() {
    this.logger.debug("Update NFL Team Scores: STARTED")

    const timeFrames = await axios.get(`https://api.sportsdata.io/v3/nfl/scores/json/Timeframes/current?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data[0]

      if (timeFrame) {
        const season = timeFrame.ApiSeason
        // const season = "2021REG"
        const week = timeFrame.ApiWeek ? timeFrame.ApiWeek : 1

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nfl/stats/json/PlayerGameStatsByWeek/${season}/${week}?key=${process.env.SPORTS_DATA_NFL_KEY}`
        )

        if (status === 200) {
          const now = new Date()
          const gameTeams = []

          // Get active games
          const games = await Game.find({
            where: {
              startTime: LessThanOrEqual(now),
              endTime: MoreThanOrEqual(now),
            },
            relations: {
              teams: {
                athletes: {
                  athlete: true,
                },
              },
            },
          })

          for (let game of games) {
            for (let gameTeam of game.teams) {
              var totalFantasyScore = 0

              for (let athlete of gameTeam.athletes) {
                const athleteData = data.find((athleteData: any) => athleteData.PlayerID === athlete.athlete.apiId)

                if (athleteData !== undefined) {
                  totalFantasyScore += athleteData.FantasyPointsDraftKings
                }
              }

              gameTeam.fantasyScore = totalFantasyScore
              gameTeams.push(gameTeam)
            }
          }

          await GameTeam.save(gameTeams, { chunk: 20 })

          this.logger.debug("Update NFL Team Scores: FINISHED")
        }
      }
    }
  }

  //@Timeout(1)
  ////@Interval(900000) // Runs every 15 mins
  async updateNbaAthleteStatsPerSeason() {
    this.logger.debug("Update NBA Athlete Stats: STARTED")

    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data

      if (timeFrame) {
        const season = timeFrame.ApiSeason

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nba/stats/json/PlayerSeasonStats/${season}?key=${process.env.SPORTS_DATA_NBA_KEY}`
        )

        if (status === 200) {
          const newStats: AthleteStat[] = []
          const updateStats: AthleteStat[] = []

          for (let athleteStat of data) {
            const apiId: number = athleteStat["PlayerID"]
            const numberOfGames: number = athleteStat["Games"] > 0 ? athleteStat["Games"] : 1
            const curStat = await AthleteStat.findOne({
              where: { athlete: { apiId }, season: season.toString(), type: AthleteStatType.SEASON },
              relations: {
                athlete: true,
              },
            })

            if (curStat) {
              // Update stats here
              curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"] / numberOfGames
              curStat.points = athleteStat["Points"] / numberOfGames
              curStat.rebounds = athleteStat["Rebounds"] / numberOfGames
              curStat.offensiveRebounds = athleteStat["OffensiveRebounds"] / numberOfGames
              curStat.defensiveRebounds = athleteStat["DefensiveRebounds"] / numberOfGames
              curStat.assists = athleteStat["Assists"] / numberOfGames
              curStat.steals = athleteStat["Steals"] / numberOfGames
              curStat.blockedShots = athleteStat["BlockedShots"] / numberOfGames
              curStat.turnovers = athleteStat["Turnovers"] / numberOfGames
              curStat.personalFouls = athleteStat["PersonalFouls"] / numberOfGames
              curStat.fieldGoalsMade = athleteStat["FieldGoalsMade"] / numberOfGames
              curStat.fieldGoalsAttempted = athleteStat["FieldGoalsAttempted"] / numberOfGames
              curStat.fieldGoalsPercentage = athleteStat["FieldGoalsPercentage"] / numberOfGames
              curStat.threePointersMade = athleteStat["ThreePointersMade"] / numberOfGames
              curStat.threePointersAttempted = athleteStat["ThreePointersAttempted"] / numberOfGames
              curStat.threePointersPercentage = athleteStat["ThreePointersPercentage"] / numberOfGames
              curStat.freeThrowsMade = athleteStat["FreeThrowsMade"] / numberOfGames
              curStat.freeThrowsAttempted = athleteStat["FreeThrowsAttempted"] / numberOfGames
              curStat.freeThrowsPercentage = athleteStat["FreeThrowsPercentage"] / numberOfGames
              curStat.minutes = athleteStat["Minutes"] / numberOfGames
              curStat.played = athleteStat["Games"]
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
                    played: athleteStat["Games"],
                    fantasyScore: athleteStat["FantasyPointsDraftKings"] / numberOfGames,
                    points: athleteStat["Points"] / numberOfGames,
                    rebounds: athleteStat["Rebounds"] / numberOfGames,
                    offensiveRebounds: athleteStat["OffensiveRebounds"] / numberOfGames,
                    defensiveRebounds: athleteStat["DefensiveRebounds"] / numberOfGames,
                    assists: athleteStat["Assists"] / numberOfGames,
                    steals: athleteStat["Steals"] / numberOfGames,
                    blockedShots: athleteStat["BlockedShots"] / numberOfGames,
                    turnovers: athleteStat["Turnovers"] / numberOfGames,
                    personalFouls: athleteStat["PersonalFouls"] / numberOfGames,
                    fieldGoalsMade: athleteStat["FieldGoalsMade"] / numberOfGames,
                    fieldGoalsAttempted: athleteStat["FieldGoalsAttempted"] / numberOfGames,
                    fieldGoalsPercentage: athleteStat["FieldGoalsPercentage"] / numberOfGames,
                    threePointersMade: athleteStat["ThreePointersMade"] / numberOfGames,
                    threePointersAttempted: athleteStat["ThreePointersAttempted"] / numberOfGames,
                    threePointersPercentage: athleteStat["ThreePointersPercentage"] / numberOfGames,
                    freeThrowsMade: athleteStat["FreeThrowsMade"] / numberOfGames,
                    freeThrowsAttempted: athleteStat["FreeThrowsAttempted"] / numberOfGames,
                    freeThrowsPercentage: athleteStat["FreeThrowsPercentage"] / numberOfGames,
                    minutes: athleteStat["Minutes"] / numberOfGames,
                  })
                )
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })

          this.logger.debug("Update NBA Athlete Stats: FINISHED")
        } else {
          this.logger.error("NBA Athlete Stats Data: SPORTS DATA ERROR")
        }
      }
    } else {
      this.logger.error("NBA Timeframes Data: SPORTS DATA ERROR")
    }
  }

  ////@Interval(900000) // runs every 15 minutes
  async updateMlbAthleteStatsPerSeason(){
    this.logger.debug("Update MLB Athlete Stats (Season): STARTED")

    // const timeframe = await Timeframe.findOne({
    //   where: {
    //     sport: SportType.MLB
    //   }
    // })
    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_MLB_KEY}`)

    if (timeFrames.status === 200){
      const timeFrame = timeFrames.data

      if(timeFrame){
        const season = timeFrame.ApiSeason
        const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/stats/json/PlayerSeasonStats/${season}?key=${process.env.SPORTS_DATA_MLB_KEY}`)
  
        if (status === 200){
          const newStats: AthleteStat[] = []
          const updateStats: AthleteStat[] = []
  
          for (let athleteStat of data){
            const apiId: number = athleteStat["PlayerID"]
            const numberOfGames: number = athleteStat["Games"] > 0 ? athleteStat["Games"] : 1
            const curStat = await AthleteStat.findOne({
              where: { athlete: {apiId}, season: season.toString(), type: AthleteStatType.SEASON},
              relations: {
                athlete: true,
              }
            })
  
            if (curStat) {
              //updating stats
              curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"] / numberOfGames
              curStat.atBats = athleteStat["AtBats"] / numberOfGames
              curStat.runs = athleteStat["Runs"] / numberOfGames
              curStat.hits = athleteStat["Hits"] / numberOfGames
              curStat.singles = athleteStat["Singles"] / numberOfGames
              curStat.doubles = athleteStat["Doubles"] / numberOfGames
              curStat.triples = athleteStat["Triples"] / numberOfGames
              curStat.homeRuns = athleteStat["HomeRuns"] / numberOfGames
              curStat.runsBattedIn = athleteStat["RunsBattedIn"] / numberOfGames
              curStat.battingAverage = athleteStat["BattingAverage"]
              curStat.strikeouts = athleteStat["Strikeouts"] / numberOfGames
              curStat.walks = athleteStat["Walks"] / numberOfGames
              curStat.caughtStealing = athleteStat["CaughtStealing"] / numberOfGames
              curStat.onBasePercentage = athleteStat["OnBasePercentage"]
              curStat.sluggingPercentage = athleteStat["SluggingPercentage"]
              curStat.onBasePlusSlugging = athleteStat["OnBasePlusSlugging"] / numberOfGames
              curStat.wins = athleteStat["Wins"] / numberOfGames
              curStat.losses = athleteStat["Losses"] / numberOfGames
              curStat.earnedRunAverage = athleteStat["EarnedRunAverage"]
              curStat.hitByPitch = athleteStat["HitByPitch"] / numberOfGames
              curStat.stolenBases = athleteStat["StolenBases"] / numberOfGames
              curStat.walksHitsPerInningsPitched = athleteStat["WalksHitsPerInningsPitched"]
              curStat.pitchingBattingAverageAgainst = athleteStat["PitchingBattingAverageAgainst"]
              curStat.pitchingHits = athleteStat["PitchingHits"] / numberOfGames
              curStat.pitchingRuns = athleteStat["PitchingRuns"] / numberOfGames
              curStat.pitchingEarnedRuns = athleteStat["PitchingEarnedRuns"] / numberOfGames
              curStat.pitchingWalks = athleteStat["PitchingWalks"] / numberOfGames
              curStat.pitchingHomeRuns = athleteStat["PitchingHomeRuns"] / numberOfGames
              curStat.pitchingStrikeouts = athleteStat["PitchingStrikeouts"] / numberOfGames
              curStat.pitchingCompleteGames = athleteStat["PitchingCompleteGames"] / numberOfGames
              curStat.pitchingShutouts = athleteStat["PitchingShutOuts"] / numberOfGames
              curStat.pitchingNoHitters = athleteStat["PitchingNoHitters"] / numberOfGames
              curStat.played = athleteStat["Games"]
              updateStats.push(curStat)
            } else{
              const curAthlete = await Athlete.findOne({
                where: {apiId}
              })
  
              if(curAthlete){
                newStats.push(
                  AthleteStat.create({
                    athlete: curAthlete,
                    season: season.toString(),
                    type: AthleteStatType.SEASON,
                    position: athleteStat["Position"],
                    played: athleteStat["Games"],
                    statId: athleteStat["StatID"],
                    fantasyScore: athleteStat["FantasyPointsDraftKings"] / numberOfGames,
                    atBats: athleteStat["AtBats"] / numberOfGames,
                    runs: athleteStat["Runs"] / numberOfGames,
                    hits: athleteStat["Hits"] / numberOfGames,
                    singles: athleteStat["Singles"] / numberOfGames,
                    doubles: athleteStat["Doubles"] / numberOfGames,
                    triples: athleteStat["Triples"] / numberOfGames,
                    homeRuns: athleteStat["HomeRuns"] / numberOfGames,
                    runsBattedIn: athleteStat["RunsBattedIn"] / numberOfGames,
                    battingAverage: athleteStat["BattingAverage"],
                    strikeouts: athleteStat["Strikeouts"] / numberOfGames,
                    walks: athleteStat["Walks"] / numberOfGames,
                    caughtStealing: athleteStat["CaughtStealing"] / numberOfGames,
                    onBasePercentage: athleteStat["OnBasePercentage"] / numberOfGames,
                    sluggingPercentage: athleteStat["SluggingPercentage"] / numberOfGames,
                    wins: athleteStat["Wins"] / numberOfGames,
                    losses: athleteStat["Losses"] / numberOfGames,
                    earnedRunAverage: athleteStat["EarnedRunAverage"],
                    hitByPitch: athleteStat["HitByPitch"] / numberOfGames,
                    stolenBases: athleteStat["StolenBases"] / numberOfGames,
                    walksHitsPerInningsPitched: athleteStat["WalksHitsPerInningsPitched"],
                    pitchingBattingAverageAgainst: athleteStat["PitchingBattingAverageAgainst"],
                    pitchingHits: athleteStat["PitchingHits"],
                    pitchingRuns: athleteStat["PitchingRuns"],
                    pitchingEarnedRuns: athleteStat["PitchingEarnedRuns"],
                    pitchingWalks: athleteStat["PitchingWalks"],
                    pitchingHomeRuns: athleteStat["PitchingHomeRuns"],
                    pitchingStrikeouts: athleteStat["PitchingStrikeouts"] / numberOfGames,
                    pitchingCompleteGames: athleteStat["PitchingCompleteGames"] / numberOfGames,
                    pitchingShutouts: athleteStat["PitchingShutOuts"] / numberOfGames,
                    pitchingNoHitters: athleteStat["PitchingNoHitters"] / numberOfGames,
  
                  })
                )
              }
            }
            
            
          }
          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20})
          this.logger.debug("Update MLB Athlete Stats (Season): FINISHED")
        } else{
          this.logger.debug("Update MLB Athlete Stats (Season): SPORTS DATA ERROR")
        }
      } else{
        this.logger.debug("Update MLB Athlete Stats (Season): NO CURRENT SEASON FOUND")
      }
    }
    
  }

  ////@Interval(300000) // runs every 5 minutes
  async updateMlbAthleteStatsPerDay(){
    this.logger.debug("Update MLB Athlete Stats Per Day: STARTED")
    
    //change this later to same with NBA
    // const timeFrame = await Timeframe.findOne({
    //   where: {
    //     sport: SportType.MLB
    //   }
    // })
    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_MLB_KEY}`)

    if (timeFrames.status === 200){
      const timeFrame = timeFrames.data

      if (timeFrame){
        const season = timeFrame.ApiSeason
        const dateFormat = moment().tz("America/New_York").subtract(3, "hours").format("YYYY-MMM-DD").toUpperCase()
  
        this.logger.debug("MLB - " +dateFormat)
  
        const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/stats/json/PlayerGameStatsByDate/${dateFormat}?key=${process.env.SPORTS_DATA_MLB_KEY}`)
  
        if (status === 200 && Object.keys(data).length !== 0){
          const newStats: AthleteStat[] = []
          const updateStats: AthleteStat[] = []
  
          for (let athleteStat of data){
            const apiId: number = athleteStat["PlayerID"]
            const curStat = await AthleteStat.findOne({
              where: {
                statId: athleteStat["StatID"],
              },
              relations:{
                athlete: true,
              }
            })
  
            const opponent = await Team.findOne({
              where: { apiId: athleteStat["GlobalOpponentID"]},
            })
  
            const apiDate = moment.tz(athleteStat["DateTime"], "America/New_York")
            const utcDate = apiDate.utc().format()
  
            if (curStat){
              curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"]
              curStat.atBats = athleteStat["AtBats"]
              curStat.runs = athleteStat["Runs"]
              curStat.hits = athleteStat["Hits"]
              curStat.singles = athleteStat["Singles"]
              curStat.doubles = athleteStat["Doubles"]
              curStat.triples = athleteStat["Triples"]
              curStat.homeRuns = athleteStat["HomeRuns"]
              curStat.runsBattedIn = athleteStat["RunsBattedIn"]
              curStat.battingAverage = athleteStat["BattingAverage"]
              curStat.strikeouts = athleteStat["Strikeouts"]
              curStat.walks = athleteStat["Walks"]
              curStat.caughtStealing = athleteStat["CaughtStealing"]
              curStat.onBasePercentage = athleteStat["OnBasePercentage"]
              curStat.sluggingPercentage = athleteStat["SluggingPercentage"]
              curStat.onBasePlusSlugging = athleteStat["OnBasePlusSlugging"]
              curStat.wins = athleteStat["Wins"]
              curStat.losses = athleteStat["Losses"]
              curStat.earnedRunAverage = athleteStat["EarnedRunAverage"]
              curStat.hitByPitch = athleteStat["HitByPitch"]
              curStat.stolenBases = athleteStat["StolenBases"]
              curStat.walksHitsPerInningsPitched = athleteStat["WalksHitsPerInningsPitched"]
              curStat.pitchingBattingAverageAgainst = athleteStat["PitchingBattingAverageAgainst"]
              curStat.pitchingHits = athleteStat["PitchingHits"]
              curStat.pitchingRuns = athleteStat["PitchingRuns"]
              curStat.pitchingEarnedRuns = athleteStat["PitchingEarnedRuns"]
              curStat.pitchingWalks = athleteStat["PitchingWalks"]
              curStat.pitchingHomeRuns = athleteStat["PitchingHomeRuns"]
              curStat.pitchingStrikeouts = athleteStat["PitchingStrikeouts"]
              curStat.pitchingCompleteGames = athleteStat["PitchingCompleteGames"]
              curStat.pitchingShutouts = athleteStat["PitchingShutOuts"]
              curStat.pitchingNoHitters = athleteStat["PitchingNoHitters"]
              curStat.played = athleteStat["Games"]
              curStat.gameDate = athleteStat["DateTime"] !== null ? new Date(utcDate) : athleteStat["DateTime"]
              updateStats.push(curStat)
            } else{
              const curAthlete = await Athlete.findOne({
                where: { apiId}
              })
  
              if (curAthlete){
                newStats.push(
                  AthleteStat.create({
                    athlete: curAthlete,
                    season: season,
                    opponent: opponent,
                    gameDate: athleteStat["DateTime"] !== null ? new Date(utcDate) : athleteStat["DateTime"],
                    type: AthleteStatType.DAILY,
                    statId: athleteStat["StatID"],
                    position: athleteStat["Position"],
                    played: athleteStat["Games"],
                    fantasyScore: athleteStat["FantasyPointsDraftKings"],
                    atBats: athleteStat["AtBats"],
                    runs: athleteStat["Runs"],
                    hits: athleteStat["Hits"],
                    singles: athleteStat["Singles"],
                    doubles: athleteStat["Doubles"],
                    triples: athleteStat["Triples"],
                    homeRuns: athleteStat["HomeRuns"],
                    runsBattedIn: athleteStat["RunsBattedIn"],
                    battingAverage: athleteStat["BattingAverage"],
                    strikeouts: athleteStat["Strikeouts"],
                    walks: athleteStat["Walks"],
                    caughtStealing: athleteStat["CaughtStealing"],
                    onBasePercentage: athleteStat["OnBasePercentage"],
                    sluggingPercentage: athleteStat["SluggingPercentage"],
                    wins: athleteStat["Wins"],
                    losses: athleteStat["Losses"],
                    earnedRunAverage: athleteStat["EarnedRunAverage"],
                    hitByPitch: athleteStat["HitByPitch"],
                    stolenBases: athleteStat["StolenBases"],
                    walksHitsPerInningsPitched: athleteStat["WalksHitsPerInningsPitched"],
                    pitchingBattingAverageAgainst: athleteStat["PitchingBattingAverageAgainst"],
                    pitchingHits: athleteStat["PitchingHits"],
                    pitchingRuns: athleteStat["PitchingRuns"],
                    pitchingEarnedRuns: athleteStat["PitchingEarnedRuns"],
                    pitchingWalks: athleteStat["PitchingWalks"],
                    pitchingHomeRuns: athleteStat["PitchingHomeRuns"],
                    pitchingStrikeouts: athleteStat["PitchingStrikeouts"],
                    pitchingCompleteGames: athleteStat["PitchingCompleteGames"],
                    pitchingShutouts: athleteStat["PitchingShutOuts"],
                    pitchingNoHitters: athleteStat["PitchingNoHitters"],
  
                  })
                )
              }
            }
          }
  
          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })
          this.logger.debug("Update MLB Athlete Stats (Daily): FINISHED")
        } else{
          this.logger.debug("Update MLB Athlete Stats (Daily): SPORTS DATA ERROR")
          if(Object.keys(data).length === 0){
            this.logger.debug("Update MLB Athlete Stats (Daily): EMPTY DATA RESPONSE")
          }
        }
      } else{
        this.logger.debug("Update MLB Athlete Stats (Daily): NO CURRENT SEASON")
      }
    }
    
  }
   //@Timeout(1)
  //////@Interval(300000) // Runs every 5 mins
  async updateNbaAthleteStatsPerDay() {
    this.logger.debug("Update NBA Athlete Stats Per Day: STARTED")

    const timeFrames = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`)

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data

      if (timeFrame) {
        const season = timeFrame.ApiSeason
        const dateFormat = moment().tz("America/New_York").subtract(3, "hours").format("YYYY-MMM-DD").toUpperCase()

        this.logger.debug(dateFormat)

        const { data, status } = await axios.get(
          `${process.env.SPORTS_DATA_URL}nba/stats/json/PlayerGameStatsByDate/${dateFormat}?key=${process.env.SPORTS_DATA_NBA_KEY}`
        )

        if (status === 200 && Object.keys(data).length !== 0) {
          const newStats: AthleteStat[] = []
          const updateStats: AthleteStat[] = []

          for (let athleteStat of data) {
            const apiId: number = athleteStat["PlayerID"]
            const curStat = await AthleteStat.findOne({
              where: {
                statId: athleteStat["StatID"],
              },
              relations: {
                athlete: true,
              },
            })

            const opponent = await Team.findOne({
              where: { apiId: athleteStat["GlobalOpponentID"] },
            })
            const apiDate = moment.tz(athleteStat["DateTime"], "America/New_York")
            const utcDate = apiDate.utc().format()
            if (curStat) {
              // Update stats here
              curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"]
              curStat.opponent = opponent
              curStat.season = season
              curStat.points = athleteStat["Points"]
              curStat.rebounds = athleteStat["Rebounds"]
              curStat.offensiveRebounds = athleteStat["OffensiveRebounds"]
              curStat.defensiveRebounds = athleteStat["DefensiveRebounds"]
              curStat.assists = athleteStat["Assists"]
              curStat.steals = athleteStat["Steals"]
              curStat.blockedShots = athleteStat["BlockedShots"]
              curStat.turnovers = athleteStat["Turnovers"]
              curStat.personalFouls = athleteStat["PersonalFouls"]
              curStat.fieldGoalsMade = athleteStat["FieldGoalsMade"]
              curStat.fieldGoalsAttempted = athleteStat["FieldGoalsAttempted"]
              curStat.fieldGoalsPercentage = athleteStat["FieldGoalsPercentage"]
              curStat.threePointersMade = athleteStat["ThreePointersMade"]
              curStat.threePointersAttempted = athleteStat["ThreePointersAttempted"]
              curStat.threePointersPercentage = athleteStat["ThreePointersPercentage"]
              curStat.freeThrowsMade = athleteStat["FreeThrowsMade"]
              curStat.freeThrowsAttempted = athleteStat["FreeThrowsAttempted"]
              curStat.freeThrowsPercentage = athleteStat["FreeThrowsPercentage"]
              curStat.minutes = athleteStat["Minutes"]
              curStat.played = athleteStat["Games"]
              curStat.gameDate = athleteStat["DateTime"] !== null ? new Date(utcDate) : athleteStat["DateTime"]
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
                    opponent: opponent,
                    gameDate: athleteStat["DateTime"] !== null ? new Date(utcDate) : athleteStat["DateTime"],
                    statId: athleteStat["StatID"],
                    type: AthleteStatType.DAILY,
                    position: athleteStat["Position"],
                    played: athleteStat["Games"],
                    fantasyScore: athleteStat["FantasyPointsDraftKings"],
                    points: athleteStat["Points"],
                    rebounds: athleteStat["Rebounds"],
                    offensiveRebounds: athleteStat["OffensiveRebounds"],
                    defensiveRebounds: athleteStat["DefensiveRebounds"],
                    assists: athleteStat["Assists"],
                    steals: athleteStat["Steals"],
                    blockedShots: athleteStat["BlockedShots"],
                    turnovers: athleteStat["Turnovers"],
                    personalFouls: athleteStat["PersonalFouls"],
                    fieldGoalsMade: athleteStat["FieldGoalsMade"],
                    fieldGoalsAttempted: athleteStat["FieldGoalsAttempted"],
                    fieldGoalsPercentage: athleteStat["FieldGoalsPercentage"],
                    threePointersMade: athleteStat["ThreePointersMade"],
                    threePointersAttempted: athleteStat["ThreePointersAttempted"],
                    threePointersPercentage: athleteStat["ThreePointersPercentage"],
                    freeThrowsMade: athleteStat["FreeThrowsMade"],
                    freeThrowsAttempted: athleteStat["FreeThrowsAttempted"],
                    freeThrowsPercentage: athleteStat["FreeThrowsPercentage"],
                    minutes: athleteStat["Minutes"],
                  })
                )
              }
            }
          }

          await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })

          this.logger.debug("Update NBA Athlete Stats Per Day: FINISHED")
        } else{
          this.logger.debug("Update NBA Athlete Stats Per Day: SPORTS DATA ERROR")
          if(Object.keys(data).length === 0){
            this.logger.debug("Update NBA Athlete Stats Per Day: EMPTY DATA RESPONSE")
          }
        }
      }
    } else {
      this.logger.error("NBA Timeframes Data: SPORTS DATA ERROR")
    }
  }
  
  //@Timeout(1)
  async updateNbaAthleteStatsPerDayLoop() {
    this.logger.debug("Update NBA Athlete GameDate Convert: STARTED")

    const timeFrames = await axios.get(
      `${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`
    )

    if (timeFrames.status === 200) {
      const timeFrame = timeFrames.data

      if (timeFrame) {
        let timesRun = 0
        let interval = setInterval(async () => {
          timesRun += 1
          const season = timeFrame.ApiSeason
          const date = moment().subtract(timesRun, "day").toDate()
          const dateFormat = moment(date).format("YYYY-MMM-DD").toUpperCase()
          this.logger.debug(dateFormat)

          const { data, status } = await axios.get(
            `${process.env.SPORTS_DATA_URL}nba/stats/json/PlayerGameStatsByDate/${dateFormat}?key=${process.env.SPORTS_DATA_NBA_KEY}`
          )

          if (status === 200) {
            const newStats: AthleteStat[] = []
            const updateStats: AthleteStat[] = []

            for (let athleteStat of data) {
              const apiId: number = athleteStat["PlayerID"]
              const curStat = await AthleteStat.findOne({
                where: { statId: athleteStat["StatID"],
                },
                relations: { athlete: true, 
                },
              })

              const opponent = await Team.findOne({
                where: { apiId: athleteStat["GlobalOpponentID"] },
              })
              const apiDate = moment.tz(athleteStat["DateTime"], "America/New_York")
              const utcDate = apiDate.utc().format()
              if (curStat) {
                // Update stats here
                curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"]
                curStat.opponent = opponent
                curStat.season = season
                curStat.points = athleteStat["Points"]
                curStat.rebounds = athleteStat["Rebounds"]
                curStat.offensiveRebounds = athleteStat["OffensiveRebounds"]
                curStat.defensiveRebounds = athleteStat["DefensiveRebounds"]
                curStat.assists = athleteStat["Assists"]
                curStat.steals = athleteStat["Steals"]
                curStat.blockedShots = athleteStat["BlockedShots"]
                curStat.turnovers = athleteStat["Turnovers"]
                curStat.personalFouls = athleteStat["PersonalFouls"]
                curStat.fieldGoalsMade = athleteStat["FieldGoalsMade"]
                curStat.fieldGoalsAttempted =athleteStat["FieldGoalsAttempted"]
                curStat.fieldGoalsPercentage = athleteStat["FieldGoalsPercentage"]
                curStat.threePointersMade = athleteStat["ThreePointersMade"]
                curStat.threePointersAttempted = athleteStat["ThreePointersAttempted"]
                curStat.threePointersPercentage = athleteStat["ThreePointersPercentage"]
                curStat.freeThrowsMade = athleteStat["FreeThrowsMade"]
                curStat.freeThrowsAttempted = athleteStat["FreeThrowsAttempted"]
                curStat.freeThrowsPercentage = athleteStat["FreeThrowsPercentage"]
                curStat.minutes = athleteStat["Minutes"]
                curStat.played = athleteStat["Games"]
                curStat.gameDate = athleteStat["DateTime"] !== null ? new Date(utcDate) : athleteStat["DateTime"]
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
                      opponent: opponent,
                      gameDate: athleteStat["DateTime"] !== null ? new Date(utcDate) : athleteStat["DateTime"],
                      statId: athleteStat["StatID"],
                      type: AthleteStatType.DAILY,
                      position: athleteStat["Position"],
                      played: athleteStat["Games"],
                      fantasyScore: athleteStat["FantasyPointsDraftKings"],
                      points: athleteStat["Points"],
                      rebounds: athleteStat["Rebounds"],
                      offensiveRebounds: athleteStat["OffensiveRebounds"],
                      defensiveRebounds: athleteStat["DefensiveRebounds"],
                      assists: athleteStat["Assists"],
                      steals: athleteStat["Steals"],
                      blockedShots: athleteStat["BlockedShots"],
                      turnovers: athleteStat["Turnovers"],
                      personalFouls: athleteStat["PersonalFouls"],
                      fieldGoalsMade: athleteStat["FieldGoalsMade"],
                      fieldGoalsAttempted: athleteStat["FieldGoalsAttempted"],
                      fieldGoalsPercentage: athleteStat["FieldGoalsPercentage"],
                      threePointersMade: athleteStat["ThreePointersMade"],
                      threePointersAttempted: athleteStat["ThreePointersAttempted"],
                      threePointersPercentage: athleteStat["ThreePointersPercentage"],
                      freeThrowsMade: athleteStat["FreeThrowsMade"],
                      freeThrowsAttempted: athleteStat["FreeThrowsAttempted"],
                      freeThrowsPercentage: athleteStat["FreeThrowsPercentage"],
                      minutes: athleteStat["Minutes"],
                    })
                  )
                }
              }
            }

            await AthleteStat.save([...newStats, ...updateStats], {
              chunk: 20,
            })

            this.logger.debug("Update NBA Athlete GameDate Convert: FINISHED")
          } else {
            this.logger.debug("NBA Player Game by Date API: SPORTS DATA ERROR")
          }

          if (timesRun === 12) {
            clearInterval(interval)
          }
        }, 300000)
      }
    } else {
      this.logger.error("NBA Timeframes Data: SPORTS DATA ERROR")
    }
  }

  //@Timeout(1)
  async updateMlbAthleteStatsPerDayLoop(){
    this.logger.debug("Update MLB Athlete Stats: Started")

    const timeFrames = await axios.get(
      `${process.env.SPORTS_DATA_URL}mlb/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_MLB_KEY}`
    )
    if (timeFrames.status === 200){
      const timeFrame = timeFrames.data

      if (timeFrame){
        let timesRun = 0
        let interval = setInterval(async () => {
          timesRun+= 1
          const season = timeFrame.ApiSeason
          const date = moment().tz("America/New_York").subtract(timesRun, "day").toDate()
          const dateFormat = moment(date).format("YYYY-MMM-DD").toUpperCase()
          this.logger.debug(dateFormat)

          const { data, status } = await axios.get(
            `${process.env.SPORTS_DATA_URL}mlb/stats/json/PlayerGameStatsByDate/${dateFormat}?key=${process.env.SPORTS_DATA_MLB_KEY}`
          )

          if (status === 200 && Object.keys(data).length !== 0){
            const newStats: AthleteStat[] = []
            const updateStats: AthleteStat[] = []
  
            for (let athleteStat of data){
              const apiId: number = athleteStat["PlayerID"]
              const curStat = await AthleteStat.findOne({
                where: {
                  statId: athleteStat["StatID"],
                },
                relations:{
                  athlete: true,
                }
              })
    
              const opponent = await Team.findOne({
                where: { apiId: athleteStat["GlobalOpponentID"]},
              })
    
              const apiDate = moment.tz(athleteStat["DateTime"], "America/New_York")
              const utcDate = apiDate.utc().format()
    
              if (curStat){
                curStat.fantasyScore = athleteStat["FantasyPointsDraftKings"]
                curStat.atBats = athleteStat["AtBats"]
                curStat.runs = athleteStat["Runs"]
                curStat.hits = athleteStat["Hits"]
                curStat.singles = athleteStat["Singles"]
                curStat.doubles = athleteStat["Doubles"]
                curStat.triples = athleteStat["Triples"]
                curStat.homeRuns = athleteStat["HomeRuns"]
                curStat.runsBattedIn = athleteStat["RunsBattedIn"]
                curStat.battingAverage = athleteStat["BattingAverage"]
                curStat.strikeouts = athleteStat["Strikeouts"]
                curStat.walks = athleteStat["Walks"]
                curStat.caughtStealing = athleteStat["CaughtStealing"]
                curStat.onBasePercentage = athleteStat["OnBasePercentage"]
                curStat.sluggingPercentage = athleteStat["SluggingPercentage"]
                curStat.onBasePlusSlugging = athleteStat["OnBasePlusSlugging"]
                curStat.wins = athleteStat["Wins"]
                curStat.losses = athleteStat["Losses"]
                curStat.earnedRunAverage = athleteStat["EarnedRunAverage"]
                curStat.hitByPitch = athleteStat["HitByPitch"]
                curStat.stolenBases = athleteStat["StolenBases"]
                curStat.walksHitsPerInningsPitched = athleteStat["WalksHitsPerInningsPitched"]
                curStat.pitchingBattingAverageAgainst = athleteStat["PitchingBattingAverageAgainst"]
                curStat.pitchingHits = athleteStat["PitchingHits"]
                curStat.pitchingRuns = athleteStat["PitchingRuns"]
                curStat.pitchingEarnedRuns = athleteStat["PitchingEarnedRuns"]
                curStat.pitchingWalks = athleteStat["PitchingWalks"]
                curStat.pitchingHomeRuns = athleteStat["PitchingHomeRuns"]
                curStat.pitchingStrikeouts = athleteStat["PitchingStrikeouts"]
                curStat.pitchingCompleteGames = athleteStat["PitchingCompleteGames"]
                curStat.pitchingShutouts = athleteStat["PitchingShutOuts"]
                curStat.pitchingNoHitters = athleteStat["PitchingNoHitters"]
                curStat.played = athleteStat["Games"]
                curStat.gameDate = athleteStat["DateTime"] !== null ? new Date(utcDate) : athleteStat["DateTime"]
                updateStats.push(curStat)
              } else{
                const curAthlete = await Athlete.findOne({
                  where: { apiId}
                })
    
                if (curAthlete){
                  newStats.push(
                    AthleteStat.create({
                      athlete: curAthlete,
                      season: season,
                      opponent: opponent,
                      gameDate: athleteStat["DateTime"] !== null ? new Date(utcDate) : athleteStat["DateTime"],
                      type: AthleteStatType.DAILY,
                      statId: athleteStat["StatID"],
                      position: athleteStat["Position"],
                      played: athleteStat["Games"],
                      fantasyScore: athleteStat["FantasyPointsDraftKings"],
                      atBats: athleteStat["AtBats"],
                      runs: athleteStat["Runs"],
                      hits: athleteStat["Hits"],
                      singles: athleteStat["Singles"],
                      doubles: athleteStat["Doubles"],
                      triples: athleteStat["Triples"],
                      homeRuns: athleteStat["HomeRuns"],
                      runsBattedIn: athleteStat["RunsBattedIn"],
                      battingAverage: athleteStat["BattingAverage"],
                      strikeouts: athleteStat["Strikeouts"],
                      walks: athleteStat["Walks"],
                      caughtStealing: athleteStat["CaughtStealing"],
                      onBasePercentage: athleteStat["OnBasePercentage"],
                      sluggingPercentage: athleteStat["SluggingPercentage"],
                      wins: athleteStat["Wins"],
                      losses: athleteStat["Losses"],
                      earnedRunAverage: athleteStat["EarnedRunAverage"],
                      hitByPitch: athleteStat["HitByPitch"],
                      stolenBases: athleteStat["StolenBases"],
                      walksHitsPerInningsPitched: athleteStat["WalksHitsPerInningsPitched"],
                      pitchingBattingAverageAgainst: athleteStat["PitchingBattingAverageAgainst"],
                      pitchingHits: athleteStat["PitchingHits"],
                      pitchingRuns: athleteStat["PitchingRuns"],
                      pitchingEarnedRuns: athleteStat["PitchingEarnedRuns"],
                      pitchingWalks: athleteStat["PitchingWalks"],
                      pitchingHomeRuns: athleteStat["PitchingHomeRuns"],
                      pitchingStrikeouts: athleteStat["PitchingStrikeouts"],
                      pitchingCompleteGames: athleteStat["PitchingCompleteGames"],
                      pitchingShutouts: athleteStat["PitchingShutOuts"],
                      pitchingNoHitters: athleteStat["PitchingNoHitters"],
    
                    })
                  )
                }
              }
            }
    
            await AthleteStat.save([...newStats, ...updateStats], { chunk: 20 })
            this.logger.debug("Update MLB Athlete Stats (Daily)(Loop): FINISHED")
          } else {
            this.logger.debug("Update MLB Athlete Stats (Daily)(Loop): SPORTS DATA ERROR")
            if(Object.keys(data).length === 0) {
              this.logger.debug("Update MLB Athlete Stats (Daily)(Loop): EMPTY DATA RESPONSE")
            }
          }
          if (timesRun === 30){
            clearInterval(interval)
          }
        }, 300000)
      }
    }
  }
  //@Timeout(1)
  async getInitialNflTimeframe (){

    this.logger.debug("Get Initial NFL Timeframe: STARTED")

    const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/recent?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if(status === 200){
      const newTimeframe: Timeframe[] = []
      const updateTimeframe : Timeframe[] = []

      for (let timeframe of data){
        const apiSeason: string = timeframe["ApiSeason"]
        const apiWeek: string = timeframe["ApiWeek"]
        const apiName: string = timeframe["Name"]
        const currTimeframe = await Timeframe.findOne({
          where : {
            apiSeason: apiSeason,
            apiWeek: apiWeek,
            apiName: apiName,
          }
        })

        if(currTimeframe){
          currTimeframe.apiName = timeframe["Name"]
          currTimeframe.season = timeframe["Season"]
          currTimeframe.seasonType = timeframe["SeasonType"]
          currTimeframe.apiWeek = timeframe["ApiWeek"]
          currTimeframe.apiSeason = timeframe["ApiSeason"]
          currTimeframe.startDate = timeframe["StartDate"]
          currTimeframe.endDate = timeframe["EndDate"]
          updateTimeframe.push(currTimeframe)
        } else{
          newTimeframe.push(
            Timeframe.create({
              apiName: timeframe["Name"],
              season: timeframe["Season"],
              seasonType: timeframe["SeasonType"],
              apiWeek: timeframe["ApiWeek"],
              apiSeason: timeframe["ApiSeason"],
              sport: SportType.NFL,
              startDate: timeframe["StartDate"],
              endDate: timeframe["EndDate"],
            })
          )
        }
      }
      await Timeframe.save([...newTimeframe, ...updateTimeframe], { chunk: 20})
      this.logger.debug("Get Initial NFL Timeframe: FINISHED")
    } else{
      this.logger.error("Get Initial NFL Timeframe: SPORTS DATA ERROR")
    }
  }

  //////@Interval(259200000) //Runs every 3 days
  async updateNflTimeframe (){

    this.logger.debug("Update NFL Timeframe: STARTED")

    const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nfl/scores/json/Timeframes/recent?key=${process.env.SPORTS_DATA_NFL_KEY}`)

    if(status === 200){
      const newTimeframe: Timeframe[] = []
      const updateTimeframe : Timeframe[] = []

      for (let timeframe of data){
        const apiSeason: string = timeframe["ApiSeason"]
        const apiWeek: string = timeframe["ApiWeek"]
        const apiName: string = timeframe["Name"]
        const currTimeframe = await Timeframe.findOne({
          where : {
            apiSeason: apiSeason,
            apiWeek: apiWeek,
            apiName: apiName,
          }
        })

        if(currTimeframe){
          currTimeframe.apiName = timeframe["Name"]
          currTimeframe.season = timeframe["Season"]
          currTimeframe.seasonType = timeframe["SeasonType"]
          currTimeframe.apiWeek = timeframe["ApiWeek"]
          currTimeframe.apiSeason = timeframe["ApiSeason"]
          currTimeframe.startDate = timeframe["StartDate"]
          currTimeframe.endDate = timeframe["EndDate"]
          updateTimeframe.push(currTimeframe)
        } else{
          newTimeframe.push(
            Timeframe.create({
              apiName: timeframe["Name"],
              season: timeframe["Season"],
              seasonType: timeframe["SeasonType"],
              apiWeek: timeframe["ApiWeek"],
              apiSeason: timeframe["ApiSeason"],
              sport: SportType.NFL,
              startDate: timeframe["StartDate"],
              endDate: timeframe["EndDate"],
            })
          )
        }
      }
      await Timeframe.save([...newTimeframe, ...updateTimeframe], { chunk: 20})
      this.logger.debug("Update NFL Timeframe: FINISHED")
    } else{
      this.logger.error("Update NFL Timeframe: SPORTS DATA ERROR")
    }
  }

  //@Timeout(1)
  ////@Interval(3600000) //Runs every 1 hour
  async updateNbaCurrentSeason () {
    
    this.logger.debug("Update NBA Current Season: STARTED")

    const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_NBA_KEY}`)

    if(status === 200){
      const newSeason: Timeframe[] = []
      const updateSeason: Timeframe[] = []

      const season = data
      const currSeason = await Timeframe.findOne({
        where: {
          sport: SportType.NBA
        }
      })

      if(currSeason){
        currSeason.apiName = season["Description"]
        currSeason.season = season["Season"]
        currSeason.seasonType = getSeasonType(season["SeasonType"])
        currSeason.apiSeason = season["ApiSeason"]
        currSeason.startDate = season["RegularSeasonStartDate"]
        currSeason.endDate = season["PostSeasonStartDate"]
        updateSeason.push(currSeason)
      } else{
        
        newSeason.push(
          Timeframe.create({
            apiName: season["Description"],
            season: season["Season"],
            seasonType: getSeasonType(season["SeasonType"]),
            apiSeason: season["ApiSeason"],
            startDate: season["RegularSeasonStartDate"],
            endDate: season["PostSeasonStartDate"],
            sport: SportType.NBA,
          })
        )
      }
      
      await Timeframe.save([...newSeason, ...updateSeason], {chunk: 20})
      this.logger.debug("Update NBA Current Season: FINISHED")
    } else{
      this.logger.debug("Update NBA Current Season: SPORTS DATA ERROR")
    }
    
  }

  ////@Interval(3600000) // runs every 1 hour
  async updateMlbCurrentSeason(){
    this.logger.debug("Update MLB Current Season: STARTED")

    const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/CurrentSeason?key=${process.env.SPORTS_DATA_MLB_KEY}`)

    if (status === 200){
      const newSeason: Timeframe[] = []
      const updateSeason: Timeframe[] = []

      const season = data
      const currSeason = await Timeframe.findOne({
        where: {
          sport: SportType.MLB
        }
      })

      if(currSeason){

        currSeason.season = season["Season"]
        currSeason.seasonType = getSeasonType(season["SeasonType"])
        currSeason.apiSeason = season["ApiSeason"]
        currSeason.startDate = season["RegularSeasonStartDate"]
        currSeason.endDate = season["PostSeasonStartDate"]
        updateSeason.push(currSeason)
      } else{
        newSeason.push(
          Timeframe.create({
            season: season["Season"],
            seasonType: getSeasonType(season["SeasonType"]),
            apiSeason: season["ApiSeason"],
            startDate: season["RegularSeasonStartDate"],
            endDate: season["PostSeasonStartDate"],
            sport: SportType.MLB,
          })
        )
      }
      await Timeframe.save([...newSeason, ...updateSeason], {chunk: 20})
      this.logger.debug("Update MLB Current Season: FINISHED")
    } else{
      this.logger.debug("Update MLB Current Season: SPORTS DATA ERROR")
    }
  }
  
  //@Timeout(1)
  ////@Interval(4200000) // Runs every 1 hour 10 minutes
  async updateNbaSchedules(){
    this.logger.debug("UPDATE NBA Schedules: STARTED")

    const currSeason = await Timeframe.findOne({
      where: {sport: SportType.NBA}
    })

    if(currSeason){
      const currSchedules = await Schedule.find({
        where: [
          {season: Not(currSeason.season), sport: SportType.NBA},
          {seasonType: Not(currSeason.seasonType), sport:SportType.NBA},
        ]
      })

      if(currSchedules.length > 0){
        this.logger.debug("Update NBA Schedules: START DELETE PREVIOUS SEASON")
        await Schedule.remove(currSchedules)
        this.logger.debug("Update NBA Schedules: DELETED PREVIOUS SEASON SCHEDULE")
      }

      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}nba/scores/json/Games/${currSeason.apiSeason}?key=${process.env.SPORTS_DATA_NBA_KEY}`)

      if (status === 200){
        const newSchedule: Schedule[] = []
        const updateSchedule: Schedule[] = []

        for(let schedule of data) {
          const gameId: number = schedule["GameID"]

          const currSchedule = await Schedule.findOne({
            where: { gameId: gameId, sport: SportType.NBA }
          })
          
          const timeFromAPI = moment.tz(schedule["DateTime"], 'America/New_York')
          const utcDate = timeFromAPI.utc().format()
         
          if(currSchedule){
            currSchedule.season = schedule["Season"]
            currSchedule.seasonType = schedule["SeasonType"]
            currSchedule.status = schedule["Status"]
            currSchedule.awayTeam = schedule["AwayTeam"]
            currSchedule.homeTeam = schedule["HomeTeam"]
            currSchedule.isClosed = schedule["IsClosed"]
            currSchedule.dateTime = schedule["DateTime"] !== null ? new Date(utcDate) : schedule["DateTime"]
            currSchedule.dateTimeUTC = schedule["DateTimeUTC"]
            updateSchedule.push(currSchedule)
          } else{
            newSchedule.push(
              Schedule.create({
                gameId: schedule["GameID"],
                season: schedule["Season"],
                seasonType: schedule["SeasonType"],
                status: schedule["Status"],
                awayTeam: schedule["AwayTeam"],
                homeTeam: schedule["HomeTeam"],
                isClosed: schedule["IsClosed"],
                dateTime: schedule["DateTime"] !== null ? new Date(utcDate) : schedule["DateTime"],
                dateTimeUTC: schedule["DateTimeUTC"],
                sport: SportType.NBA,
              })
            )
          }
        }
        await Schedule.save([...newSchedule, ...updateSchedule], {chunk: 20})
      }
      this.logger.debug("Update NBA Schedules: FINISHED")
    } else{
      this.logger.error("Update NBA Schedules: ERROR CURRENT SEASON NOT FOUND")
    }
    
  }

  ////@Interval(4200000) // runs every 1 hour 20 minutes
  async updateMlbSchedules(){
    this.logger.debug("UPDATE MLB Schedules: STARTED")

    const currSeason = await Timeframe.findOne({
      where: { sport: SportType.MLB}
    })

    if (currSeason){
      const currSchedules = await Schedule.find({
        where: [
          {season: Not(currSeason.season), sport: SportType.MLB},
          {seasonType: Not(currSeason.seasonType), sport: SportType.MLB},
        ]
      })

      if (currSchedules.length > 0){
        this.logger.debug("Update MLB Schedules: START DELETE PREVIOUS SEASON SCHEDULE")
        await Schedule.remove(currSchedules)
        this.logger.debug("Update MLB Schedules: DELETED PREVIOUS SEASON SCHEDULE")
      }

      const { data, status } = await axios.get(`${process.env.SPORTS_DATA_URL}mlb/scores/json/Games/${currSeason.apiSeason}?key=${process.env.SPORTS_DATA_MLB_KEY}`)

      if (status === 200){
        const newSchedule: Schedule[] = []
        const updateSchedule: Schedule[] = []

        for (let schedule of data){
          const gameId: number = schedule["GameID"]

          const currSchedule = await Schedule.findOne({
            where: { gameId: gameId, sport: SportType.MLB }
          })

          const timeFromAPI = moment.tz(schedule["DateTime"], 'America/New_York')
          const utcDate = timeFromAPI.utc().format()

          if (currSchedule){
            currSchedule.season = schedule["Season"]
            currSchedule.seasonType = schedule["SeasonType"]
            currSchedule.status = schedule["Status"]
            currSchedule.awayTeam = schedule["AwayTeam"]
            currSchedule.homeTeam = schedule["HomeTeam"]
            currSchedule.isClosed = schedule["IsClosed"]
            currSchedule.dateTime = schedule["DateTime"] !== null ? new Date(utcDate) : schedule["DateTime"]
            currSchedule.dateTimeUTC = schedule["DateTimeUTC"]
            updateSchedule.push(currSchedule)
          } else{
            newSchedule.push(
              Schedule.create({
                gameId: schedule["GameID"],
                season: schedule["Season"],
                seasonType: schedule["SeasonType"],
                status: schedule["Status"],
                awayTeam: schedule["AwayTeam"],
                homeTeam: schedule["HomeTeam"],
                isClosed: schedule["IsClosed"],
                dateTime: schedule["DateTime"] !== null ? new Date(utcDate) : schedule["DateTime"],
                dateTimeUTC: schedule["DateTimeUTC"],
                sport: SportType.MLB,
              })
            )
          }
        }
        await Schedule.save([...newSchedule, ...updateSchedule], { chunk: 20 })

      }
      this.logger.debug("Update MLB Schedules: FINISHED")
    } else {
      this.logger.error("Update MLB Schedules: ERROR CURRENT SEASON NOT FOUND")
    }
  }

  //@Timeout(1)
  async syncCricketData(){
    this.logger.debug("START CRICKET DATA SYNC")
    const TOURNEY_KEY = 'iplt20_2023' //hardcoded iplt2023 key

    const auth = await axios.post(`${process.env.ROANUZ_DATA_URL}core/${process.env.ROANUZ_PROJECT_KEY}/auth/`, {
      api_key: process.env.ROANUZ_API_KEY
    } )
    if(auth.status === 200){
      const tourneyCount = await CricketTournament.count({
        where: { key: TOURNEY_KEY}
      })

      if (tourneyCount === 0 ){
        //start getting tournament data
        const tournament_response = await axios.get(
          `${process.env.ROANUZ_DATA_URL}cricket/${process.env.ROANUZ_PROJECT_KEY}/tournament/${TOURNEY_KEY}/`, {
            headers: {
              'rs-token': auth.data.data.token
            }
          } 
        )
        if(tournament_response.status === 200){
          const tournament = tournament_response.data.data
          try{
            await CricketTournament.create({
              key: tournament.tournament.key,
              name: tournament.tournament.name,
              start_date: moment.unix(tournament.tournament.start_date),
              sport: SportType.CRICKET,
            }).save()
          } catch(e){
            this.logger.error(e)
          }
          const teamCount = await CricketTeam.count({
            where: { tournament: {sport: SportType.CRICKET}}
          })
          if(teamCount === 0){
            //start getting team data from tournament API result
            const tourney = await CricketTournament.findOneOrFail({
              where: {sport: SportType.CRICKET}
            })
            for(let [key, value] of Object.entries(tournament.teams as CricketTeamInterface)){
              try{
                await CricketTeam.create({
                  key: value.key,
                  name: value.name,
                  tournament: tourney,
                  sport: SportType.CRICKET,
                }).save()
              } catch(e){
                this.logger.error(e)
              }
            }
          }
        }
      } else{
        this.logger.debug("CRICKET DATA SYNC")
      }

      const athleteCount = await CricketAthlete.count({
        where: { cricketTeam: {sport: SportType.CRICKET}}
      })

      if(athleteCount === 0){
        const teams = await CricketTeam.find({
          where:{
            sport: SportType.CRICKET
          },
          relations: {
            tournament: true,
          }
          
        })
        this.logger.debug("START ATHLETE SYNC")
        for (let team of teams){
          
          const team_response = await axios.get(`${process.env.ROANUZ_DATA_URL}cricket/${process.env.ROANUZ_PROJECT_KEY}/tournament/${team.tournament.key}/team/${team.key}/`, {
            headers: {
              'rs-token': auth.data.data.token
            }
          })
          if(team_response.status === 200){
            const athletes = team_response.data.data.tournament_team.players

            for(let [key, value] of Object.entries(athletes as CricketAthleteInterface)){
              try{
                await CricketAthlete.create({
                  playerKey: value.key,
                  name: value.name,
                  jerseyName: value.jersey_name,
                  gender: value.gender,
                  nationality: value.nationality.name,
                  seasonalRole: value.seasonal_role,
                  cricketTeam: team,
                }).save()
              } catch(e){
                this.logger.error(e)
              }
            }
          }
          
        }
        this.logger.debug("FINISH CRICKET DATA SYNC")
      }
    } else{
      this.logger.error("CRICKET AUTHENTICATION FAIL !!!")
    }
  }
  
  // @Timeout(1)
  // async getCricketDataFromJson(){

  //   this.logger.debug("START CRICKET DATA SYNC")
  //   const data = cricketTournamentJson.data
  //   const tourneyCount = await CricketTournament.count({
  //     where: { key: data.tournament.key}
  //   })
  //   if (tourneyCount === 0){
  //     try{
  //       await CricketTournament.create({
  //         key: data.tournament.key,
  //         name: data.tournament.name,
  //         start_date: moment.unix(data.tournament.start_date),
  //         sport: SportType.CRICKET,
  //       }).save()
  //     } catch(e){
  //       this.logger.error(e)
  //     }
  //   } 
  //   this.logger.debug(`CRICKET TOURNAMENT ${tourneyCount ? 'DID NOT SYNC' : 'SYNCED SUCCESSFULLY'} `)

  //   const teamCount = await CricketTeam.count({
  //     where: {tournament: {key: data.tournament.key}}
  //   })
    
  //   if(teamCount === 0){
  //     const tourney = await CricketTournament.findOneOrFail({
  //       where: {key: data.tournament.key}
  //     })

  //     for (let [key, value] of Object.entries(data.teams)){
  //       try{
  //         await CricketTeam.create({
  //           key: value.key,
  //           name: value.name,
  //           tournament: tourney,
  //           sport: SportType.CRICKET,
  //         }).save()
  //       } catch(err){
  //         this.logger.error(err)
  //       }
  //     }
  //   }
  //   this.logger.debug(`Cricket Teams: ${teamCount ? "ALREADY EXISTS" : "SYNCED"}`)

  //   const athleteList = cricketAthletesJson
  //   const athleteCount = await CricketAthlete.count({
  //     where: {cricketTeam: {sport: SportType.CRICKET}}
  //   })

  //   if(athleteCount === 0){
  //     for (let [key, value] of Object.entries(athleteList)){
  //       const team = await CricketTeam.findOneOrFail({
  //         where: {key: value.data.team.key}
  //       })
  //       for(let [key, player] of Object.entries(value.data.tournament_team.players)){
  //         try{
  //           await CricketAthlete.create({
  //             playerKey: player.key,
  //             name: player.name,
  //             jerseyName: player.jersey_name,
  //             gender: player.gender,
  //             nationality: player.nationality.name,
  //             seasonalRole: player.seasonal_role,
  //             cricketTeam: team,
  //           }).save()
  //         } catch(err){
  //           this.logger.error(err)
  //         }
  //       }
  //     }
  //   }
  //   this.logger.debug(`Cricket Athletes: ${athleteCount ? "ALREADY EXISTS" : 'SYNCED'}`)
  // }

  ////@Interval(3600000)
  async updateCricketMatches(){
    this.logger.debug("Update Cricket Matches: START")
    //const tourney_key_2022 = "iplt20_2023" // for testing
    const auth = await axios.post(`${process.env.ROANUZ_DATA_URL}core/${process.env.ROANUZ_PROJECT_KEY}/auth/`, {
      api_key: process.env.ROANUZ_API_KEY
    })
    if(auth.status === 200 ){
      const tourney = await CricketTournament.findOneOrFail({
        where: {sport: SportType.CRICKET}
      })

      const match_response = await axios.get(`${process.env.ROANUZ_DATA_URL}cricket/${process.env.ROANUZ_PROJECT_KEY}/tournament/${tourney.key}/fixtures/`, {
        headers: {
          'rs-token': auth.data.data.token
        }
      })

      if (match_response.status === 200){
        const matches = match_response.data.data.matches
        const newMatch: CricketMatch[] = []
        const updateMatch: CricketMatch[] = []
        for (let match of matches){
          const existingMatch = await CricketMatch.findOne({
            where: { key: match.key}
          })
          
          const team_a = await CricketTeam.findOne({
            where: {key : match.teams.a.key}
          })
          const team_b = await CricketTeam.findOne({
            where: {key: match.teams.b.key}
          })
          if (existingMatch){
            existingMatch.name = match.name
            existingMatch.status = match.status
            existingMatch.start_at = moment.unix(match.start_at).toDate()
            existingMatch.team_a = team_a !== null ? team_a : undefined
            existingMatch.team_b = team_b !== null ? team_b : undefined
            updateMatch.push(existingMatch)
          } else {
            newMatch.push(
              CricketMatch.create({
                key: match.key,
                name: match.name,
                status: match.status,
                start_at: moment.unix(match.start_at),
                team_a: team_a !== null ? team_a : undefined,
                team_b: team_b !== null ? team_b : undefined,
                tournament: tourney,
              })
            )
          }
        }
        await CricketMatch.save([...newMatch, ...updateMatch], { chunk: 20})
        this.logger.debug("Update Cricket Match: FINISHED")
      } else{
        this.logger.error("Update Cricket Match: ROANUZ")
      }
    }
  }
  //@Timeout(1)
  // async getCricketMatches(){
  //   //TODO: currently getting from JSON only, change to API request later
  //   this.logger.debug("Update Cricket Matches: START")
  //   const matches = cricketMatchesJson.data.matches

  //   const newMatch: CricketMatch[] = []
  //   const updateMatch: CricketMatch[] = []

  //   for(let match of matches){
  //     const existingMatch = await CricketMatch.findOne({
  //       where: { key: match.key}
  //     })
  
  //     if (existingMatch){
  //       existingMatch.name = match.name
  //       existingMatch.status = match.status
  //       existingMatch.start_at = moment.unix(match.start_at).toDate()

  //       this.logger.debug("unix date: " + moment.unix(match.start_at).toDate())
  //       updateMatch.push(existingMatch)
  //     } else{
  //       const tourney = await CricketTournament.findOne({
  //         where: {key: 'iplt20_2023'}
  //       })
  //       if(tourney){
  //         newMatch.push(
  //           CricketMatch.create({
  //             key: match.key,
  //             name: match.name,
  //             status: match.status,
  //             start_at: moment.unix(match.start_at),
  //             tournament: tourney,
  //           })
  //         )
  //       } else{
  //         this.logger.error("Update Cricket Match: TOURNAMENT DOES NOT EXIST")
  //       }
        
  //     }
  //   }
  //   await CricketMatch.save([...newMatch, ...updateMatch], { chunk: 20 })
  //   this.logger.debug("Update Cricket Match: FINISHED")
  // }

  ////@Interval(3900000)
  async updateCricketAthleteStats(){
    this.logger.debug("Update Cricket Athlete Stat: STARTED")

    const auth = await axios.post(`${process.env.ROANUZ_DATA_URL}core/${process.env.ROANUZ_PROJECT_KEY}/auth/`, {
      api_key: process.env.ROANUZ_API_KEY
    })

    if (auth.status === 200){
      const dateFormat = moment().subtract(6, "hours").format("YYYY-MM-DD").toUpperCase()
      //const dateFormat = moment(date).format("YYYY-MM-DD").toUpperCase()
      this.logger.debug(dateFormat)
      let matches = await CricketMatch.find()
      matches = matches.filter((x) => x.start_at.toISOString().split("T")[0] === dateFormat)
      
      if(matches){
        //add for let
        const newStats: CricketAthleteStat[] = []
        const updateStats: CricketAthleteStat[] = []
        for (let match of matches ){
          const match_response = await axios.get(`${process.env.ROANUZ_DATA_URL}cricket/${process.env.ROANUZ_PROJECT_KEY}/fantasy-match-points/${match.key}/`, {
            headers: {
              'rs-token': auth.data.data.token
            }
          })

          if (match_response.status === 200){
            const metric = match_response.data.data.metrics
            
            for (let athleteStat of match_response.data.data.points){
              const athlete = await CricketAthlete.findOne({
                where: { playerKey: athleteStat.player_key}
              })

              if(athlete){
                let currStat = await CricketAthleteStat.findOne({
                  where : { athlete: { playerKey: athleteStat.player_key}, match: {key : match.key}}
                })
                if(currStat){

                  //TODO add tournament_points 
                  if(Object.keys(athleteStat.points_breakup).length){
                    const points_breakup = athleteStat.points_breakup.map((x: CricketPointsBreakup) => (
                      {[metric[x.metric_rule_index].key] : x.points}
                    ))
                    updateStats.push(CricketAthleteStat.create(Object.assign({
                      "id": currStat.id,
                      "athlete": athlete,
                      "fantasyScore": athleteStat.points,
                      "tournament_points": athleteStat.tournament_points,
                      "type": AthleteStatType.DAILY,
                    }, ...points_breakup)))
                  } else{
                    updateStats.push(CricketAthleteStat.create(Object.assign({
                      "id": currStat.id,
                      "athlete": athlete,
                      "fantasyScore": athleteStat.points,
                      "tournament_points": athleteStat.tournament_points,
                      "type": AthleteStatType.DAILY,
                    })))
                  }
                  
                } else{

                  if(Object.keys(athleteStat.points_breakup).length){
                    const points_breakup = athleteStat.points_breakup.map((x: CricketPointsBreakup) => (
                      {[metric[x.metric_rule_index].key] : x.points}
                    ))
                    newStats.push(CricketAthleteStat.create(Object.assign({
                      "athlete": athlete,
                      "match": match,
                      "fantasyScore": athleteStat.points,
                      "tournament_points": athleteStat.tournament_points,
                      "type": AthleteStatType.DAILY,
                    }, ...points_breakup)))
                  } else{
                    newStats.push(CricketAthleteStat.create(Object.assign({
                      "athlete": athlete,
                      "match": match,
                      "fantasyScore": athleteStat.points,
                      "tournament_points": athleteStat.tournament_points, 
                      "type": AthleteStatType.DAILY
                    })))
                  }
                  
                }
              } else{
                this.logger.error("Update Cricket Athlete Stat: ERROR ATHLETE DOES NOT EXIST")
              }
            }
          }
        }
        await CricketAthleteStat.save([...newStats, ...updateStats], {chunk: 20})
        this.logger.debug("Update Cricket Athlete Stat: FINISHED")
      } else{
        this.logger.debug("Update Cricket Athlete Stat: No games found on " + dateFormat )
      }
      //TODO: check how match dates are formatted in backend
    }
  }

  //@Timeout(1)
  ////@Interval(4200000)
  async updateCricketAthleteAvgFantasyScore(){  
    this.logger.debug("Update Cricket Athlete Avg. Fantasy Score: STARTED")
    const newStats: CricketAthleteStat[] = []
    const updateStats: CricketAthleteStat[] = []

    const athletes = await CricketAthlete.find({
      relations: { stats: { match: true }}
    })

    if(athletes.length > 0){
      for (let athlete of athletes){
        const completedGames = athlete.stats ? athlete.stats.filter((x) => (x.match !== null && x.match !== undefined) && x.match.status === 'completed' && x.type === 'daily') : []
        
        if(Array.isArray(completedGames)){
          const id: string = athlete["playerKey"]
          let currStat = await CricketAthleteStat.findOne({
            where: { athlete: { playerKey: id }, type: AthleteStatType.SEASON },
            relations: { athlete: true, },
          }) 

          let totalFantasyScore: number = 0
          if(completedGames.length > 0){
            for (let i = 0 ; i < completedGames.length; i++){
              
                totalFantasyScore = +totalFantasyScore + +completedGames[i].fantasyScore!
            }
          } else{
            totalFantasyScore = 0
          }
          if(currStat){ 
            //update average stats 
            //TODO fix tables since primary id on different tables were replaced 
            updateStats.push(CricketAthleteStat.create({
              id: currStat.id,
              athlete: currStat.athlete,
              fantasyScore: currStat.fantasyScore,
              type: AthleteStatType.SEASON,
            }))
          } else{
            newStats.push(
              CricketAthleteStat.create({
                athlete: athlete,
                fantasyScore: totalFantasyScore === 0 ? totalFantasyScore = 0 : totalFantasyScore / completedGames.length,
                type: AthleteStatType.SEASON,
              }))
          }
        }
        else{
          this.logger.debug("Update Cricket Avg. Fantasy Score: No completed games found")
        }
      }
    } 
    else{
      this.logger.debug("Update Cricket Avg. Fantasy Score: No athletes found")
    }
    await CricketAthleteStat.save([...newStats, ...updateStats], {chunk: 20})
    this.logger.debug("Update Cricket Avg. Fantasy Score: FINISHED")
  }

  // //@Timeout(1)
  // async updateCricketAthleteStats(){
  //   //TODO add interval querying to API logic
  //   this.logger.debug("Update Cricket Athlete Stat: STARTED")
  //   //const data = cricketGameOne.data
   

  //   const {data, status} = await axios.get(`${process.env.ROANUZ_DATA_URL}${process.env.ROANUZ_PROJECT_KEY}`)
  //   const matchKey = data.match.match_meta.key
  //   const match = await CricketMatch.findOne({
  //     where: { key: matchKey}
  //   })
    
  //   if(match){
  //     const metric = data.metrics
  //     const newStats: CricketAthleteStat[] = []
  //     const updateStats: CricketAthleteStat[] = []

  //     for (let athleteStat of data.points){

  //       const athlete = await CricketAthlete.findOne({
  //         where: {playerKey: athleteStat.player_key}
  //       })

  //       if(athlete){
  //         let currStat = await CricketAthleteStat.findOne({
  //           where: {athlete: {playerKey: athleteStat.player_key}, match: {key: matchKey}}
  //         })

  //         if(currStat){
  //           //updating stats, TODO: need to test on API call instead of json
  //           const points_breakup = athleteStat.points_breakup.map((x) => (
  //             {[metric[x.metric_rule_index].key]: x.points}
  //           ))
  //           updateStats.push(CricketAthleteStat.create(Object.assign({
  //             "id": currStat.id,
  //             "athlete": athlete,
  //             "fantasyScore": athleteStat.points,
  //             "type": AthleteStatType.DAILY,
  //           }, ...points_breakup)))
  //         } else{

  //           const points_breakup = athleteStat.points_breakup.map((x) => (
  //             {[metric[x.metric_rule_index].key]: x.points}
  //           ))

  //           newStats.push(CricketAthleteStat.create(Object.assign({
  //             "athlete": athlete,
  //             "match": match,
  //             "fantasyScore": athleteStat.points,
  //             "type": AthleteStatType.DAILY,
  //           }, ...points_breakup)))
  //         }

  //       } else{
  //         this.logger.error("Update Cricket Athlete Stat: ERROR ATHLETE DOES NOT EXIST")
  //       }

  //     }
  //     await CricketAthleteStat.save([...newStats, ...updateStats], {chunk: 20})
  //   }
  // }

  //@Timeout(1)
  //unused due to required API call not being included in IPL package
  async updateCricketAthleteSeasonStats(){
    this.logger.debug("Update Cricket Athlete Stat (Season): STARTED")

    const athletes = await CricketAthlete.find()
    //if using pay as you go, add where playerKey: In(CRICKET_ATHLETE_IDS)
    if(athletes){
      const auth = await axios.post(`${process.env.ROANUZ_DATA_URL}core/${process.env.ROANUZ_PROJECT_KEY}/auth/`, {
        api_key: process.env.ROANUZ_API_KEY
      })

      const tourney = await CricketTournament.findOneOrFail({
        where: {sport: SportType.CRICKET}
      })

      const newStats: CricketAthleteStat[] = []
      const updateStats: CricketAthleteStat[] = []
      for (let athlete of athletes){
        const stats_response = await axios.get(`${process.env.ROANUZ_DATA_URL}cricket/${process.env.ROANUZ_PROJECT_KEY}/tournament/${tourney.key}/player/${athlete.playerKey}/stats/`, {
          headers:{
            'rs-token': auth.data.data.token
          }
        })

        if(stats_response.status === 200){
          const stats = stats_response.data.data.stats
          const currStat = await CricketAthleteStat.findOne({
            where: { athlete: {playerKey: athlete.playerKey}, type: AthleteStatType.SEASON},
            relations: {
              athlete: true
            }
          })

          if (currStat){
            currStat.matches = stats.batting.matches
            currStat.not_outs = stats.batting.not_outs
            currStat.batting_runs = stats.batting.runs
            currStat.high_score = stats.batting.high_score
            currStat.batting_average = stats.batting.average
            currStat.batting_balls = stats.batting.balls
            currStat.batting_strike_rate = stats.batting.strike_rate
            currStat.hundreds = stats.batting.hundreds
            currStat.fifties = stats.batting.fifties
            currStat.fours = stats.batting.fours
            currStat.sixes = stats.batting.sixes
            currStat.catches = stats.fielding.catches
            currStat.stumpings = stats.fielding.stumpings
            currStat.bowling_balls = stats.bowling.balls
            currStat.wickets = stats.bowling.wickets
            currStat.bowling_average = stats.bowling.average
            currStat.economy = stats.bowling.economy
            currStat.bowling_strike_rate = stats.bowling.strike_rate
            currStat.four_wickets = stats.bowling.four_wickets
            currStat.five_wickets = stats.bowling.five_wickets
            updateStats.push(currStat)
          } else{
            newStats.push(
              CricketAthleteStat.create({
                athlete: athlete,
                type: AthleteStatType.SEASON,
                matches: stats.batting.matches,
                not_outs: stats.batting.not_outs,
                batting_runs: stats.batting.runs,
                high_score: stats.batting.high_score,
                batting_average: stats.batting.average,
                batting_balls: stats.batting.balls,
                batting_strike_rate: stats.batting.strike_rate,
                hundreds: stats.batting.hundreds,
                fifties: stats.batting.fifties,
                fours: stats.batting.fours,
                sixes: stats.batting.sixes,
                catches: stats.fielding.catches,
                stumpings: stats.fielding.stumpings,
                bowling_balls: stats.bowling.balls,
                wickets: stats.bowling.wickets,
                bowling_average: stats.bowling.average,
                economy: stats.bowling.economy,
                bowling_strike_rate: stats.bowling.strike_rate,
                four_wickets: stats.bowling.four_wickets,
                five_wickets: stats.bowling.five_wickets,
              })
            )
          }
        }
      }
      await CricketAthleteStat.save([...newStats, ...updateStats], { chunk: 20 })
      this.logger.debug("Update Cricket Athlete Stat (Season): FINISHED")
    }
  }

  //@Timeout(1)
  async runNearMainnetBaseballWebSocketListener(){
    function listenToMainnet(){
      const ws = new WebSocket('wss://events.near.stream/ws')
      ws.on('open', function open(){
        console.log("test")
        ws.send(JSON.stringify({
          secret: 'secret',
          filter: [
            {
              account_id: "game.baseball.playible.near",
              event: {
                "event": "add_game",
                "standard": "game",
              }
              
            },
            {
              account_id: "game.baseball.playible.near",
              event: {
                "event": "lineup_submission_result",
                "standard": "game",
              }
            },
          ],
          fetch_past_events: 10//capped at 15?
        }))
      })
    
      ws.on("message", async function incoming(data) {
        const util = require("util")
    
        const logger = new Logger("WEBSOCKET")
        logger.debug("MESSAGE RECEIVED")
        const msg = JSON.parse(data.toString())
        //console.log(msg.events[0].predecessor_id);
        //console.log(util.inspect(msg, false, null, true))
        console.log(data.toString())
        console.log(msg.events.length);
        //console.log(msg.events[0].event.data[0].game_id);
        if(msg.events.length > 0){
          
          for(let event of msg.events){
            if(event.event.event === 'lineup_submission_result'){
              console.log("lineup submission")

              const gameTeam = await GameTeam.findOne({
                where: {
                  game: {
                    gameId: event.event.data[0].game_id, 
                    sport: SportType.MLB
                  },
                  name: event.event.data[0].team_name,
                  wallet_address: event.event.data[0].signer,
                },
                
              })

              if(gameTeam){ //team submission already exists
                Logger.debug("This team already exists")
              } else{
                const game = await Game.findOne({
                  where: { 
                    gameId: event.event.data[0].game_id, 
                    sport: SportType.MLB
                  }
                })
                if(game){ //add lineup processing
                  // try{
                  //   GameTeam.create({
                  //     game: game,
                  //     name: event.event.data[0].team_name, //add sportType
                  //     wallet_address: event.event.data[0].signer,
                  //   }).save()
                    
                  // } catch(e){
                  //   Logger.error(e)
                  // }
                  // GameTeam.create({
                  //   game: game,
                  //   name: event.event.data[0].team_name,
                  //   wallet_address: event.event.data[0].signer,
                  // }).save().then(async (newTeam) => {
                    
                  // })
                  await GameTeam.create({
                    game: game,
                    name: event.event.data[0].team_name,
                    wallet_address: event.event.data[0].signer,
                  }).save()

                  const lineup = event.event.data[0].lineup
                    //get the apiId
                  const currGameTeam = await GameTeam.findOneOrFail({
                    where: { 
                      game: {
                        gameId: event.event.data[0].gameId
                      }, 
                      name: event.event.data[0].team_name, 
                      wallet_address: event.event.data[0].signer
                    }
                  })
                  for(let token_id of lineup){
                    let apiId = ""
                    if(token_id.includes("PR") || token_id.includes("SB")){
                      token_id = token_id.split("_")[1]
                    }
                    apiId = token_id.split("CR")[0]
                    console.log(apiId)

                    const athlete = await Athlete.findOne({
                      where: {apiId: parseInt(apiId)}
                    })
                    if(athlete){
                      try{
                        GameTeamAthlete.create({
                          gameTeam: currGameTeam,
                          athlete: athlete,
                        }).save()

                        Logger.debug("Added athlete " + apiId + " to lineup")
                      }
                      catch(e){
                        Logger.error(e)
                      }
                      
                    } else{
                      Logger.error("ERROR athlete apiId not found, disregarding...")
                    }
                    //get the athlete, add to gameteamathlete
                  }
                  
                } else{
                  Logger.error("Game does not exist.")
                }
                
              }
            }
            else if (event.event.event === 'add_game'){
              console.log("add game")
              
              const game = await Game.findOne({
                where: {
                  gameId: event.event.data[0].game_id,
                  sport: SportType.MLB,
                }
              })
              if(game){
                Logger.error("Game " + event.event.data[0].game_id + " already exists")
              }
              else {
                await Game.create({
                  gameId: event.event.data[0].game_id,
                  name: "Game " + event.event.data[0].game_id, 
                  description: 'on-going',
                  startTime: moment(event.event.data[0].game_time_start),
                  endTime: moment(event.event.data[0].game_time_end),
                  sport: SportType.MLB
                }).save()

                Logger.debug("Game " + event.event.data[0].game_id + " created for " + SportType.MLB)
              }
            }
          }
        }
      })
      ws.on("close", function close(){
        console.log("Connection closed")
        console.log("retrying connection...")
        setTimeout(() => listenToMainnet(), 1000)
      })
    }
    
    listenToMainnet()
  }

  //@Timeout(1)
  async jsonBaseballWebsocketTest(){
    //
    const fs = require('fs')
    const msg = JSON.parse(fs.readFileSync('./src/utils/test-jsons/lineup_submission_add_game_result.txt'))
    console.log(msg)
    if(msg.events.length > 0){
          
      for(let event of msg.events){
        if(event.event.event === 'lineup_submission_result'){
          console.log("lineup submission")

          const gameTeam = await GameTeam.findOne({
            where: {
              game: {
                gameId: event.event.data[0].game_id, 
                sport: SportType.MLB
              },
              name: event.event.data[0].team_name,
              wallet_address: event.event.data[0].signer,
            },
            
          })

          if(gameTeam){ //team submission already exists
            Logger.debug("This team already exists")
          } else{
            const game = await Game.findOne({
              where: { 
                gameId: event.event.data[0].game_id, 
                sport: SportType.MLB
              }
            })
            if(game){ //add lineup processing
              // try{
              //   GameTeam.create({
              //     game: game,
              //     name: event.event.data[0].team_name, //add sportType
              //     wallet_address: event.event.data[0].signer,
              //   }).save()
                
              // } catch(e){
              //   Logger.error(e)
              // }
              // GameTeam.create({
              //   game: game,
              //   name: event.event.data[0].team_name,
              //   wallet_address: event.event.data[0].signer,
              // }).save().then(async (newTeam) => {
                
              // })
              await GameTeam.create({
                game: game,
                name: event.event.data[0].team_name,
                wallet_address: event.event.data[0].signer,
              }).save()

              const lineup = event.event.data[0].lineup
                //get the apiId
              const currGameTeam = await GameTeam.findOneOrFail({
                where: { 
                  game: {
                    gameId: event.event.data[0].gameId
                  }, 
                  name: event.event.data[0].team_name, 
                  wallet_address: event.event.data[0].signer
                }
              })
              for(let token_id of lineup){
                let apiId = ""
                if(token_id.includes("PR") || token_id.includes("SB")){
                  token_id = token_id.split("_")[1]
                }
                apiId = token_id.split("CR")[0]
                console.log(apiId)

                const athlete = await Athlete.findOne({
                  where: {apiId: parseInt(apiId)}
                })
                if(athlete){
                  try{
                    GameTeamAthlete.create({
                      gameTeam: currGameTeam,
                      athlete: athlete,
                    }).save()

                    Logger.debug("Added athlete " + apiId + " to lineup")
                  }
                  catch(e){
                    Logger.error(e)
                  }
                  
                } else{
                  Logger.error("ERROR athlete apiId not found, disregarding...")
                }
                //get the athlete, add to gameteamathlete
              }
              
            } else{
              Logger.error("Game does not exist.")
            }
            
          }
        }
        else if (event.event.event === 'add_game'){
          console.log("add game")
          
          const game = await Game.findOne({
            where: {
              gameId: event.event.data[0].game_id,
              sport: SportType.MLB,
            }
          })
          if(game){
            Logger.error("Game " + event.event.data[0].game_id + " already exists")
          }
          else {
            await Game.create({
              gameId: event.event.data[0].game_id,
              name: "Game " + event.event.data[0].game_id, 
              description: 'on-going',
              startTime: moment(event.event.data[0].game_time_start),
              endTime: moment(event.event.data[0].game_time_end),
              sport: SportType.MLB
            }).save()

            Logger.debug("Game " + event.event.data[0].game_id + " created for " + SportType.MLB)
          }
        }
      }
    }
  }

  //@Timeout(1)
  async updateGameTeamFantasyScores(){

    const games = await Game.find({
      where: {description: 'on-going'}
    })

    if(games){
      for(let game of games){
        let teamUpdate: GameTeam[] = []
        for(let team of game.teams){
          
          let teamFantasyScore = 0
          for(let teamAthlete of team.athletes){
            let athlete = teamAthlete.athlete

            athlete.stats = athlete.stats.filter((stat) => stat.gameDate && 
              moment(stat.gameDate).unix() >= moment(game.startTime).unix() && moment(stat.gameDate).unix() <= moment(game.endTime).unix())
            
            const totalAthleteFantasyScore = athlete.stats.reduce(
              (accumulator, currentValue) => accumulator + (currentValue.fantasyScore && currentValue.fantasyScore || 0) ,
              0,
            ) / athlete.stats.length
            teamFantasyScore += totalAthleteFantasyScore
            
          }
          team.fantasyScore = teamFantasyScore
          teamUpdate.push(team)
        }
        await GameTeam.save([...teamUpdate], {chunk: 20})
      }
    } else{
      this.logger.debug("No active games found");
    }
  }
  
  //@Timeout(1)
  async updateGameTeamFantasyScoreQueryBuilder(){

    // const athletesToUpdate = await AppDataSource.createQueryBuilder().select("gt").from(GameTeam, "gt")
    //   .leftJoinAndSelect("gt.athletes", "athletes").leftJoinAndSelect("athletes.athlete", "athlete").getOne()
    // const athletesToUpdate = await AppDataSource.createQueryBuilder().select("gta").from(GameTeamAthlete, "gta").leftJoinAndSelect("gta.athlete", "athlete").leftJoinAndSelect("athlete.stats", "stat")
    // this.logger.debug(JSON.stringify(athletesToUpdate))
    // this.logger.debug(athletesToUpdate?.athletes)

    const teams = await GameTeam.find({
      where: {
        game: {
          gameId: 30,
          sport: SportType.MLB,
        },
        
      },
      relations: {
        game: true,
        athletes: {
          athlete:{
            stats: true
          }
        }
      }
    })

    for(let team of teams){
      let teamFantasyScore = 0
      for(let teamAthlete of team.athletes){
        let athlete = teamAthlete.athlete

        // athlete.stats = athlete.stats.filter((stat) => stat.gameDate && 
        //   moment(stat.gameDate).unix() >= moment(team.game.startTime).unix() && moment(stat.gameDate).unix() <= moment(team.game.endTime).unix())
        
        // let totalAthleteFantasyScore = 0
        // if(athlete.stats.length > 0){
        //   totalAthleteFantasyScore = athlete.stats.reduce(
        //     (accumulator, currentValue) => +accumulator + +(currentValue.fantasyScore && currentValue.fantasyScore || 0) ,
        //     0,
        //   )
        // } 
        
        const totalAthleteFantasyScore = await AppDataSource.getRepository(AthleteStat).createQueryBuilder("as")
          .select('SUM(as.fantasyScore)', "sum").where("as.athleteId =:athleteId", {athleteId: athlete.id}).andWhere("as.gameDate >= :startTime", {startTime: team.game.startTime}).andWhere("as.gameDate <= :endTime", {endTime: team.game.endTime}).getRawOne()
       
        console.log("ts: " + teamFantasyScore)
        console.log("total: " + totalAthleteFantasyScore.sum)
        teamFantasyScore = +teamFantasyScore + +totalAthleteFantasyScore.sum
      }
      team.fantasyScore = teamFantasyScore
      console.log(teamFantasyScore)
    }
    //return teams
    // interface TeamUpdate {
    //   teamId: number;
    //   totalFantasyScore: number;
    // }
    // let currTeamId = -1

    // const athletesToUpdate = await AppDataSource.createQueryBuilder()
    //   .select("gta").from(GameTeamAthlete, "gta").leftJoinAndSelect("gta.gameTeam", "team")
    //   .leftJoinAndSelect("team.game", "game").where("game.description = :description", {description: "on-going"}).getRawMany()
    // const test = await AppDataSource.createQueryBuilder().select("gt").from(GameTeam, "gt").leftJoinAndSelect("gt.athletes", "athletes").leftJoinAndSelect("athletes.athlete", "athlete").leftJoinAndSelect("athlete.stats", "stats").getOne()
    // console.log(test?.athletes[0].athlete.stats[1].fantasyScore)
    // let updateTeam: TeamUpdate[] = []
    // for(let athlete of athletesToUpdate){
    //   if(currTeamId === -1){
    //     currTeamId = athlete.gta_gameTeamId
    //   }
    //   console.log(athlete.game_endTime)
    //   const athleteStats = await AppDataSource.createQueryBuilder().select("stats").from(AthleteStat, "stats")
    //     .where("stats.gameDate <= :gameDate", {gameDate: athlete.game_startTime})
    //     .andWhere("stats.gameDate >= :gameDate", {gameDate: athlete.game_endTime}).getRawMany()
    //   console.log(athleteStats)
    // }
    /*
    select game_team left join game, loop through game_team
    select game entity based on game_team gameId, for getting time and updating of status
    loop through game_team athletes
    */

    // const teams = await GameTeam.find({
    //   where: {
    //     game: {description: 'on-going'}
    //   }
    // })
    
    // if (teams){
    //   let teamUpdate: GameTeam[] = []
    //   for(let team of teams){
    //     let teamFantasyScore = 0
    //     for(let teamAthlete of team.athletes){
    //       let athlete = teamAthlete.athlete

    //       athlete.stats = athlete.stats.filter((stat) => stat.gameDate && 
    //         moment(stat.gameDate).unix() >= moment(team.game.startTime).unix() && moment(stat.gameDate).unix() <= moment(team.game.endTime).unix())
          
    //       const totalAthleteFantasyScore = athlete.stats.reduce(
    //         (accumulator, currentValue) => accumulator + (currentValue.fantasyScore && currentValue.fantasyScore || 0) ,
    //         0,
    //       ) / athlete.stats.length
    //       teamFantasyScore += totalAthleteFantasyScore
    //     }
    //   }
    // }
  }
}
