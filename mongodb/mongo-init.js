print("Populating posgw DB with event data");

try {
    let status = rs.status();
    print("Replica set is already initialized.");
} catch (e) {
    if (e.codeName === 'NotYetInitialized') {
        print("Replica set not yet initialized. Initiating...");
        rs.initiate({
            _id: "rs0",
            members: [
                { _id: 0, host: "pagopa-posgw-mongo:27017" }
            ]
        });
        print("Initiation command sent. Waiting for replica set to come online...");
    } else {
        print("Error checking replica set status: " + e.message);
        quit(1);
    }
}

print("Seeding data into collections...");

const db = connect("mongodb://admin:password@pagopa-posgw-mongo:27017/?retryWrites=true&replicaSet=rs0&readPreference=primary&maxIdleTimeMS=10000&connectTimeoutMS=10000&socketTimeoutMS=10000&serverSelectionTimeoutMS=60000&waitQueueTimeoutMS=10000");

db = db.getSiblingDB("posgw");
console.log("Currently using DB:", db.getName());

// TODO: Add data seeding logic

print("Data seeding completed.");

print("MongoDB initialization script finished successfully!");