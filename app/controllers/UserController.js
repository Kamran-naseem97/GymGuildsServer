const Sequelize = require('sequelize');

const { Op } = Sequelize;
const User = require('../models/User');
const Banner = require('../models/Banner');
const Challenge = require('../models/Challenges');
const UserStat = require('../models/UserStats');
const Badge = require('../models/Badge');
const FriendRequest = require('../models/FriendRequest');
const ChallengeRequest = require('../models/ChallengeRequest');
const PointsUser = require('../models/PointsUsers');
const Border = require('../models/Border');

exports.getUser = async (req, res) => {
  const todaysStart = new Date().setHours(0, 0, 0, 0);
  const now = new Date();

  try {
    const user = await User.findOne({
      where: {
        userId: req.params.userId,
      },
      order: [
        [{ model: User, as: 'myFriends' }, 'points', 'DESC'],
        [{ model: Challenge, as: 'activeChallenges' }, 'endDate'],
        [{ model: Challenge, as: 'expiredChallenges' }, 'endDate', 'DESC'],
      ],
      include: [{
        model: User,
        as: 'myFriends',
        include: [
          {
            model: Banner,
            as: 'chosenBanner',
          },
          {
            model: Border,
            as: 'chosenBorder',
          },
        ],
        required: false,
      },
      {
        model: Banner,
        as: 'chosenBanner',
      },
      {
        model: Border,
        as: 'chosenBorder',
      },
      {
        model: FriendRequest,
        as: 'recievedFriendRequests',
        where: {
          status: 0,
        },
        include: [{
          model: User,
        }],
        required: false,
      },
      {
        model: ChallengeRequest,
        as: 'recievedChallengeRequests',
        where: {
          status: 0,
        },
        include: [{
          model: Challenge,
        }],
        required: false,
      },
      {
        model: Banner,
        as: 'unlockedBanners',
        required: false,
      },
      {
        model: Challenge,
        as: 'activeChallenges',
        required: false,
        include: [
          {
            model: User,
            as: 'challengeParticipants',
          },
        ],
        where: {
          endDate: {
            [Op.gt]: now,
          },
        },
      },
      {
        model: Challenge,
        as: 'expiredChallenges',
        required: false,
        include: [
          {
            model: User,
            as: 'challengeParticipants',
          },
        ],
        where: {
          endDate: {
            [Op.lt]: now,
          },
        },
      },
      {
        model: UserStat,
        group: 'statName',
        where: {
          createdAt: {
            [Op.gt]: todaysStart,
            [Op.lt]: now,
          },
        },
        required: false,
      },
      {
        model: Badge,
        required: false,
      }],
    });

    res.send(user);
  } catch (e) {
    console.log(e);
  }
};

exports.addUserStat = async (req, res) => {
  const todaysStart = new Date().setHours(0, 0, 0, 0);
  const now = new Date();
  const promises = [];

  try {
    req.body.forEach(async (stat) => {
      const existingUserStat = await UserStat.findOne({
        where: {
          createdAt: {
            [Op.gt]: todaysStart,
            [Op.lt]: now,
          },
          userId: req.params.userId,
          statName: stat.statName,
        },
      });

      if (!existingUserStat) {
        const newUserStat = new UserStat({
          userId: req.params.userId,
          statName: stat.statName,
          value: stat.value,
        });

        const promise = newUserStat.save();
        promises.push(promise);
      } else {
        existingUserStat.value = stat.value;

        const promise = existingUserStat.save();
        promises.push(promise);
      }
    });
  } catch (e) {
    console.log(e);
    console.log(req.body);
    res.status(400);
    return res.send('Body is in wrong format');
  }

  try {
    await Promise.all(promises);
  } catch (e) {
    console.log(e);
    return res.status(500);
  }

  let calcPoints = 0;
  req.body.forEach((stat) => {
    if (stat.statName === 'Calories Burned') {
      calcPoints += parseInt(stat.value, 10);
    } else if (stat.statName === 'Minutes Exercised') {
      calcPoints += (parseInt(stat.value, 10) * 5);
    }
  });

  const existingPointsUser = await PointsUser.findOne({
    where: {
      createdAt: {
        [Op.gt]: todaysStart,
        [Op.lt]: now,
      },
      userId: req.params.userId,
    },
  });

  const user = await User.findOne({
    where: {
      userId: req.params.userId,
    },
  });

  if (!existingPointsUser) {
    const pointsUser = new PointsUser({
      points: calcPoints,
      userId: req.params.userId,
    });

    try {
      await pointsUser.save();
    } catch (e) {
      console.log(e);
    }

    user.xp += calcPoints;
    user.points += calcPoints;
  } else {
    const pointsDiff = calcPoints - existingPointsUser.points;
    existingPointsUser.points = calcPoints;

    if (pointsDiff > 0) {
      user.points += pointsDiff;
      user.xp += pointsDiff;
    }

    try {
      await existingPointsUser.save();
    } catch (e) {
      console.log(e);
    }
  }

  try {
    await user.save();
  } catch (e) {
    console.log(e);
  }

  return res.send('User stats added');
};
