const express = require("express");
const app = express();
const cors = require('cors');
const path = require("path");
const bodyParser = require("body-parser");
const Taxjar = require("taxjar");
const MongoClient = require("mongodb").MongoClient;
const port = process.env.PORT || 8080;

app.use(cors());

const SHIPPING_COST = 4.0;
const DUMMY_USERS = [
	{
		_id: "1",
		name: "Jay",
		address: { country: "CA", state: "ON", city: "toronto" },
	},
	{
		_id: "2",
		name: "Palitronica",
		address: { country: "CA", state: "BC", city: "vancouver" },
	},
];


const taxjarClient = new Taxjar({
    apiKey: "ccdf61beb57961dd3b1bbc7a881e63f4",
});

const getLineItems = (items) => {
    list_items = [];
    
	if (items) {
        items.forEach((item) => {
            let list_item = {
                quantity: item.quantity,
				unit_price: item.unit_price,
			};
			list_items.push(list_item);
		});
	}
    
	return list_items;
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let users;

let dockerURL = "mongodb://mongo:27017"
let localURL = "mongodb://localhost:27017"

const initDB = async () => {
    await MongoClient.connect(dockerURL).then(async (client) => {

        // Specify database and collection
        const db = client.db("local");

        // create collection if absent
        let col = await db.listCollections().toArray();
        if (!col.some((c) => c.name === "users")) {
            await db.createCollection("users");
        }

        users = db.collection("users");

        let addDocs = [];
        DUMMY_USERS.forEach((user) => {
            addDocs.push(user);
        });

        // add dummy documents to the collection if absent
        let res = await users.find().toArray();
        if (res.length == 0) await users.insertMany(addDocs);
    });
}

// return the user object
const getUser = async (user_id) => {
    let res = await users.findOne({ '_id': user_id });
    return res;  
}

app.post("/tax", async (request, response) => {
	user_ID = request.body.id;
	user_items = request.body.items;

	// init mongo DB
	await initDB();

	// get user
	let fetchedUser = await getUser(user_ID);
    console.log("fetched user with ID: ", user_ID, fetchedUser)

    // user found
    if (fetchedUser) {

        // prepare payload for querying TaxJar API
		let tax_query_payload = {
            to_country: fetchedUser.address.country,
			to_state: fetchedUser.address.state,
			to_city: fetchedUser.address.city,
			shipping: SHIPPING_COST,
			line_items: getLineItems(user_items),
		};
        
        // query TaxJar API 
		let tax_result = await taxjarClient.taxForOrder(tax_query_payload);
        
        // tax result obtained, create lists to be appended to frontend result
		if (tax_result) {

            let total_price = 0;
		    let resultItemsList = [];

            tax_result.tax.breakdown.line_items.forEach((item, i) => {
                let item_price = item.taxable_amount + item.tax_collectable;
				total_price += item_price;
				resultItemsList.push({
                    name: user_items[i].name,
                    price: item_price,
					tax: item.tax_collectable,
				});
			});
            
            // create the object to be sent to frontend
            let returnValue = {};
            returnValue["name"] = fetchedUser.name;
			returnValue["items"] = resultItemsList;
			returnValue["total_price"] = total_price;

            // send object to frontend
			response.json(returnValue);
		}
	}
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
    // res.sendFile('../frontend/index.html', { root: __dirname })
})

app.listen(port, () => {
	console.log(`backend server listening at http://localhost:${port}`);
});
