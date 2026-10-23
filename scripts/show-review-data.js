import '../backend/src/config.js';
import { MongoClient } from 'mongodb';

const client = new MongoClient(
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/?replicaSet=voltguard',
  { serverSelectionTimeoutMS: 5000 },
);
try {
  await client.connect();
  const database = client.db(process.env.MONGODB_DATABASE || 'voltguard');
  const deviceId = process.env.DEVICE_ID || 'voltguard-01';
  console.log('Database:', database.databaseName);
  console.log(
    'Telemetry records:',
    await database.collection('telemetry').countDocuments(),
  );
  console.log(
    'Alert records:',
    await database.collection('alerts').countDocuments(),
  );
  console.log('Latest stored device record:');
  console.log(
    JSON.stringify(
      await database
        .collection('telemetry')
        .findOne({ deviceId }, { sort: { id: -1 }, projection: { _id: 0 } }),
      null,
      2,
    ),
  );
  console.log('Recent stored alerts:');
  console.log(
    JSON.stringify(
      await database
        .collection('alerts')
        .find({ deviceId }, { projection: { _id: 0 } })
        .sort({ id: -1 })
        .limit(3)
        .toArray(),
      null,
      2,
    ),
  );
} catch {
  console.error(
    'Cannot reach local MongoDB. Start it with: powershell -File scripts/start-mongodb.ps1',
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
