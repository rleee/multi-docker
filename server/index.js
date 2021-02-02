const keys = require('./keys');

// Express App Setup
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Postgres Client Setup
const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = new Sequelize(keys.pgDatabase, keys.pgUser, keys.pgPassword, {
  host: keys.pgHost,
  dialect: 'postgres',
  logging: (...msg) => console.log(msg),
});

(async () => {
  let retries = 5;
  while (retries) {
    try {
      await sequelize.sync();
      console.log('SEQUELIZE SYNC SUCCESS');
      break;
    } catch (err) {
      retries -= 1;
      console.log(`SEQUELIZE SYNC ERROR RETRY LEFT ${retries} ===>`, err);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
})();

// CREATING MODEL
const Number = sequelize.define(
  'number',
  {
    number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: -1,
    },
  },
  {}
);

// Redis Client Setup
const redis = require('redis');
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000,
});
const redisPublisher = redisClient.duplicate();

// Express route handlers

app.get('/', async (req, res) => {
  try {
    // TEST POSTGRES CONNECTION
    await sequelize.authenticate();
    console.log('SEQUELIZE CONNECTION ESTABLISHED');
    res.send('Hi');
  } catch (err) {
    console.log('GET / CONNECTION ERROR', err);
  }
});

app.get('/values/all', async (req, res) => {
  try {
    const numbers = await Number.findAll();
    console.log('numbers:', numbers.number);
    res.send(numbers);
  } catch (err) {
    console.log('FAILED TO FETCH', err);
    res.status(501).send('ERROR NO DATA');
  }
});

app.get('/values/current', async (req, res) => {
  redisClient.hgetall('values', (err, values) => {
    res.send(values);
  });
});

app.post('/values', async (req, res) => {
  const { index } = req.body;

  if (parseInt(index) > 40) {
    return res.status(422).send('Index too high');
  }

  try {
    redisClient.hset('values', index, 'Nothing yet!');
    redisPublisher.publish('insert', index);

    console.log('TRIGGERED POST VALUES');

    const number = await Number.create({ number: index });

    console.log('THE INDEX IS... ', number.toJSON());
    res.send({ working: true });
  } catch (err) {
    console.log('FAILED TO SAVE', err);
    res.status(500).send('FAILED TO SAVE');
  }
});

app.listen(5000, (err) => {
  console.log('api Listening on 5000');
});
