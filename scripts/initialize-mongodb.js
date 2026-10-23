import { MongoClient } from 'mongodb';
const client = new MongoClient(
  'mongodb://127.0.0.1:27018/?directConnection=true',
  { serverSelectionTimeoutMS: 10000 },
);
try {
  await client.connect();
  await client
    .db('admin')
    .command({
      replSetInitiate: {
        _id: 'voltguard',
        members: [{ _id: 0, host: '127.0.0.1:27018' }],
      },
    });
  console.log('MongoDB local replica set initialized.');
} catch (error) {
  if (error.code !== 23) throw error;
  console.log('MongoDB local replica set already initialized.');
} finally {
  await client.close();
}
