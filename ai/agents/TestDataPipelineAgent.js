// TestDataPipelineAgent - Phase 11
// AI-powered test data generation pipeline that creates synthetic datasets
// for web and mobile tests, manages data profiles, and integrates with the RAG vector store.
const fs = require('fs-extra');
const path = require('path');

const DATASETS_DIR = path.join(process.cwd(), 'test-data', 'generated');
const PIPELINE_STATE_PATH = path.join(process.cwd(), 'ai/memory/test-data-pipeline-state.json');

function ensureDirs() {
  fs.ensureDirSync(DATASETS_DIR);
  fs.ensureDirSync(path.dirname(PIPELINE_STATE_PATH));
}

function loadState() {
  ensureDirs();
  if (!fs.existsSync(PIPELINE_STATE_PATH)) {
    fs.writeJsonSync(PIPELINE_STATE_PATH, { generations: [] }, { spaces: 2 });
  }
  return fs.readJsonSync(PIPELINE_STATE_PATH);
}

function saveState(state) {
  fs.writeJsonSync(PIPELINE_STATE_PATH, state, { spaces: 2 });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function slugify(text) {
  return String(text || 'data')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'data';
}

// ---------- Data Generators ----------

function generateUserProfile(index) {
  var firstNames = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Pranav','Dhruv','Krishna','Shaurya','Ananya','Priya','Ishita','Sneha','Riya','Kavya','Nandini','Shreya','Divya','Tanvi'];
  var lastNames = ['Sharma','Verma','Patel','Singh','Kumar','Gupta','Reddy','Joshi','Nair','Deshmukh'];
  var cities = ['Mumbai','Delhi','Bangalore','Hyderabad','Chennai','Kolkata','Pune','Ahmedabad','Jaipur','Lucknow'];
  var domains = ['gmail.com','yahoo.com','outlook.com','amazon.in','rediffmail.com'];

  var firstName = randomElement(firstNames);
  var lastName = randomElement(lastNames);
  var id = index + 1;

  return {
    id: 'user_' + id,
    username: firstName.toLowerCase() + '.' + lastName.toLowerCase() + id,
    password: 'Test@' + id + '#Pass',
    firstName: firstName,
    lastName: lastName,
    email: firstName.toLowerCase() + '.' + lastName.toLowerCase() + id + '@' + randomElement(domains),
    phone: '98' + String(randomInt(10000000, 99999999)),
    address: {
      street: String(randomInt(1, 999)) + ', ' + randomElement(['MG Road','Brigade Road','Park Street','Connaught Place','Marine Drive','Linking Road']),
      city: randomElement(cities),
      state: randomElement(['Maharashtra','Karnataka','Telangana','Tamil Nadu','West Bengal','Delhi','Gujarat','Rajasthan','Uttar Pradesh']),
      pincode: String(randomInt(100001, 999999)),
      country: 'India',
    },
    profileType: randomElement(['prime','standard','guest','business']),
    createdAt: new Date().toISOString(),
  };
}

function generateProduct(index) {
  var categories = ['Electronics','Books','Clothing','Home & Kitchen','Beauty','Sports','Toys','Automotive','Groceries','Health'];
  var productNames = [
    'Wireless Bluetooth Headphones','Smart LED TV 55 inch','Stainless Steel Water Bottle',
    'Organic Green Tea Pack','Yoga Mat Premium','USB-C Charging Cable',
    'Leather Wallet for Men','Cotton Bedsheet Set','Indian Cookbook - 100 Recipes',
    'Running Shoes Air Cushion','Portable Power Bank 20000mAh','Desk Lamp with USB Charger',
    'Noise Cancelling Earbuds','Casual Sneakers','Kitchen Knife Set',
    'Board Game - Strategy Edition','Sunglasses Polarized','Backpack 40L Travel',
    'Electric Kettle 1.5L','Smart Watch Fitness Tracker',
  ];

  var name = productNames[index % productNames.length];
  var category = categories[index % categories.length];
  var price = (Math.random() * 15000 + 199).toFixed(2);
  var rating = (Math.random() * 2 + 3).toFixed(1);

  return {
    id: 'prod_' + (index + 1),
    name: name,
    category: category,
    price: Number(price),
    currency: 'INR',
    rating: Number(rating),
    reviewCount: randomInt(10, 5000),
    inStock: Math.random() > 0.15,
    primeEligible: Math.random() > 0.3,
    attributes: {
      brand: randomElement(['Amazon Basics','Samsung','Apple','Boat','Mivi','Puma','Adidas','Nike','Philips','Prestige']),
      color: randomElement(['Black','White','Blue','Red','Green','Silver','Gold']),
      size: randomElement(['S','M','L','XL','One Size','500ml','1L','5kg']),
    },
    createdAt: new Date().toISOString(),
  };
}

function generateAddress(index) {
  var cities = ['Mumbai','Delhi','Bangalore','Hyderabad','Chennai','Kolkata','Pune','Ahmedabad','Jaipur','Lucknow','Chandigarh','Bhopal'];
  var landmarks = ['Near City Mall','Opposite Metro Station','Next to Park','Behind School','Near Hospital','Sector 14 Market'];
  var types = ['home','work','other'];

  return {
    id: 'addr_' + (index + 1),
    type: types[index % types.length],
    fullName: randomElement(['Aarav Sharma','Priya Verma','Vivaan Patel','Ananya Singh','Arjun Kumar']),
    phone: '98' + String(randomInt(10000000, 99999999)),
    line1: String(randomInt(1, 999)) + ', ' + randomElement(['MG Road','Brigade Road','Park Street','Connaught Place','Marine Drive','Linking Road','Sector 18','Hauz Khas']),
    line2: randomElement(landmarks),
    city: randomElement(cities),
    state: randomElement(['Maharashtra','Karnataka','Telangana','Tamil Nadu','West Bengal','Delhi','Gujarat','Rajasthan','Uttar Pradesh','Punjab','Madhya Pradesh']),
    pincode: String(randomInt(100001, 999999)),
    country: 'India',
    isDefault: index === 0,
  };
}

function generatePaymentMethod(index) {
  var cardTypes = ['Visa','MasterCard','RuPay','Amex'];
  var cardType = randomElement(cardTypes);
  var lastFour = String(randomInt(1000, 9999));

  return {
    id: 'pay_' + (index + 1),
    type: randomElement(['credit','debit','upi','netbanking','cod']),
    cardType: cardType,
    lastFourDigits: lastFour,
    maskedNumber: 'XXXX-XXXX-XXXX-' + lastFour,
    nameOnCard: randomElement(['Aarav Sharma','Priya Verma','Vivaan Patel']),
    expiryMonth: String(randomInt(1, 12)).padStart(2, '0'),
    expiryYear: String(2027 + randomInt(0, 5)),
    upiId: 'user' + (index + 1) + '@upi',
    bankName: randomElement(['SBI','HDFC','ICICI','Axis','Kotak','Yes Bank']),
    isDefault: index === 0,
  };
}

function generateCartItem(productId, productName, price, quantity) {
  return {
    productId: productId,
    productName: productName,
    price: price,
    quantity: quantity || randomInt(1, 3),
    subtotal: (price * (quantity || randomInt(1, 3))).toFixed(2),
  };
}

function generateSearchQuery(index) {
  var queries = [
    'wireless headphones','smartphone under 15000','laptop for coding','books by Indian authors',
    'men casual shirts','women ethnic wear','kitchen appliances','fitness tracker',
    'board games for kids','organic food','home decor items','car accessories',
    'baby care products','pet supplies','office stationary','garden tools',
    'camera lens','bluetooth speaker','air purifier','coffee maker',
  ];
  var categories = ['electronics','fashion','home','books','beauty','sports','toys'];

  return {
    id: 'search_' + (index + 1),
    query: queries[index % queries.length],
    category: categories[index % categories.length],
    expectedResults: randomInt(10, 500),
    isInvalid: index % 10 === 9,
  };
}

// ---------- Dataset Builders ----------

function buildUserDataset(count) {
  var users = [];
  for (var i = 0; i < count; i++) {
    users.push(generateUserProfile(i));
  }
  return users;
}

function buildProductDataset(count) {
  var products = [];
  for (var i = 0; i < count; i++) {
    products.push(generateProduct(i));
  }
  return products;
}

function buildAddressDataset(count) {
  var addresses = [];
  for (var i = 0; i < count; i++) {
    addresses.push(generateAddress(i));
  }
  return addresses;
}

function buildPaymentDataset(count) {
  var methods = [];
  for (var i = 0; i < count; i++) {
    methods.push(generatePaymentMethod(i));
  }
  return methods;
}

function buildSearchQueryDataset(count) {
  var queries = [];
  for (var i = 0; i < count; i++) {
    queries.push(generateSearchQuery(i));
  }
  return queries;
}

function buildTestSessionData(users, products) {
  var session = {
    sessionId: 'session_' + Date.now(),
    createdAt: new Date().toISOString(),
    user: randomElement(users),
    cart: {
      items: [],
      total: 0,
    },
    searchHistory: [],
    selectedAddress: null,
    selectedPayment: null,
  };

  // Add 1-3 random items to cart
  var cartSize = randomInt(1, 3);
  var usedIndices = [];
  for (var i = 0; i < cartSize; i++) {
    var idx;
    do {
      idx = randomInt(0, products.length - 1);
    } while (usedIndices.includes(idx) && usedIndices.length < products.length);
    usedIndices.push(idx);
    var p = products[idx];
    var qty = randomInt(1, 2);
    session.cart.items.push(generateCartItem(p.id, p.name, p.price, qty));
  }

  session.cart.total = Number(session.cart.items.reduce(function(sum, item) {
    return sum + Number(item.subtotal);
  }, 0).toFixed(2));

  session.searchHistory = [
    randomElement(['wireless headphones','smartphone','laptop','books','clothing']),
    randomElement(['home decor','kitchen','toys','fitness','groceries']),
  ];

  return session;
}

// ---------- Main Agent ----------
var TestDataPipelineAgent = {
  name: 'TestDataPipelineAgent',
  version: '1.0.0',

  // Generate a complete test data profile with users, products, addresses, payments, and search queries
  generateProfile: function(options) {
    var userCount = options.userCount || 25;
    var productCount = options.productCount || 50;
    var addressCount = options.addressCount || 25;
    var paymentCount = options.paymentCount || 20;
    var searchCount = options.searchCount || 30;

    console.log('[TestDataPipelineAgent] Generating test data profile');
    console.log('  Users: ' + userCount + ', Products: ' + productCount + ', Addresses: ' + addressCount + ', Payments: ' + paymentCount + ', Searches: ' + searchCount);

    var users = buildUserDataset(userCount);
    var products = buildProductDataset(productCount);
    var addresses = buildAddressDataset(addressCount);
    var payments = buildPaymentDataset(paymentCount);
    var queries = buildSearchQueryDataset(searchCount);

    // Build session data for testing
    var sessions = [];
    for (var i = 0; i < Math.min(10, userCount); i++) {
      sessions.push(buildTestSessionData(users, products));
    }

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        agent: this.name,
        version: this.version,
      },
      users: users,
      products: products,
      addresses: addresses,
      paymentMethods: payments,
      searchQueries: queries,
      testSessions: sessions,
      totals: {
        users: users.length,
        products: products.length,
        addresses: addresses.length,
        paymentMethods: payments.length,
        searchQueries: queries.length,
        testSessions: sessions.length,
      },
    };
  },

  // Write dataset to disk as JSON
  writeDataset: function(profile, label) {
    ensureDirs();
    var baseName = label || 'dataset-' + Date.now();
    var baseDir = path.join(DATASETS_DIR, slugify(baseName));
    fs.ensureDirSync(baseDir);

    var files = {};
    var categories = ['users', 'products', 'addresses', 'paymentMethods', 'searchQueries', 'testSessions'];

    categories.forEach(function(cat) {
      if (profile[cat] && profile[cat].length > 0) {
        var filePath = path.join(baseDir, cat + '.json');
        fs.writeJsonSync(filePath, profile[cat], { spaces: 2 });
        files[cat] = path.relative(process.cwd(), filePath);
      }
    });

    // Write full profile
    var profilePath = path.join(baseDir, 'full-profile.json');
    fs.writeJsonSync(profilePath, profile, { spaces: 2 });
    files.fullProfile = path.relative(process.cwd(), profilePath);

    // Write summary
    var summaryPath = path.join(baseDir, 'summary.md');
    var summaryLines = [];
    summaryLines.push('# Test Data Profile: ' + slugify(baseName));
    summaryLines.push('');
    summaryLines.push('Generated: ' + profile.metadata.generatedAt);
    summaryLines.push('Agent: ' + profile.metadata.agent + ' v' + profile.metadata.version);
    summaryLines.push('');
    summaryLines.push('## Dataset Sizes');
    summaryLines.push('');
    summaryLines.push('| Dataset | Count |');
    summaryLines.push('|---|---|');
    summaryLines.push('| Users | ' + profile.totals.users + ' |');
    summaryLines.push('| Products | ' + profile.totals.products + ' |');
    summaryLines.push('| Addresses | ' + profile.totals.addresses + ' |');
    summaryLines.push('| Payment Methods | ' + profile.totals.paymentMethods + ' |');
    summaryLines.push('| Search Queries | ' + profile.totals.searchQueries + ' |');
    summaryLines.push('| Test Sessions | ' + profile.totals.testSessions + ' |');
    summaryLines.push('');
    summaryLines.push('## Sample User');
    if (profile.users.length > 0) {
      var u = profile.users[0];
      summaryLines.push('- ' + u.firstName + ' ' + u.lastName + ' (' + u.email + ') - ' + u.profileType);
    }
    summaryLines.push('');
    summaryLines.push('## Sample Product');
    if (profile.products.length > 0) {
      var p = profile.products[0];
      summaryLines.push('- ' + p.name + ' - Rs.' + p.price + ' (' + p.category + ')');
    }
    fs.writeFileSync(summaryPath, summaryLines.join('\n'), 'utf8');
    files.summary = path.relative(process.cwd(), summaryPath);

    return {
      baseDir: path.relative(process.cwd(), baseDir),
      files: files,
      totals: profile.totals,
    };
  },

  // Main run method
  run: function(input) {
    console.log('[TestDataPipelineAgent] AI-powered test data pipeline');

    var label = input && input.label ? input.label : 'auto-dataset-' + Date.now();
    var options = {
      userCount: (input && input.userCount) || 25,
      productCount: (input && input.productCount) || 50,
      addressCount: (input && input.addressCount) || 25,
      paymentCount: (input && input.paymentCount) || 20,
      searchCount: (input && input.searchCount) || 30,
    };

    // Track in state
    var state = loadState();
    var runRecord = {
      id: 'gen-' + Date.now(),
      label: label,
      options: options,
      startedAt: new Date().toISOString(),
      status: 'generating',
    };
    state.generations.push(runRecord);
    saveState(state);

    // Generate
    var profile = this.generateProfile(options);
    var result = this.writeDataset(profile, label);

    runRecord.status = 'completed';
    runRecord.completedAt = new Date().toISOString();
    runRecord.output = {
      baseDir: result.baseDir,
      totals: result.totals,
    };
    saveState(state);

    return {
      ok: true,
      dataset: result.baseDir,
      totals: result.totals,
      files: result.files,
      runId: runRecord.id,
    };
  },

  // List all generated datasets
  listDatasets: function() {
    ensureDirs();
    var entries = fs.readdirSync(DATASETS_DIR);
    var datasets = [];
    entries.forEach(function(entry) {
      var dirPath = path.join(DATASETS_DIR, entry);
      if (fs.statSync(dirPath).isDirectory()) {
        var summaryFile = path.join(dirPath, 'summary.md');
        var profileFile = path.join(dirPath, 'full-profile.json');
        var exists = fs.existsSync(summaryFile) || fs.existsSync(profileFile);
        if (exists) {
          datasets.push({
            name: entry,
            path: path.relative(process.cwd(), dirPath),
            hasSummary: fs.existsSync(summaryFile),
            hasProfile: fs.existsSync(profileFile),
          });
        }
      }
    });
    return datasets;
  },

  // Get generation history
  getRunHistory: function() {
    var state = loadState();
    return state.generations || [];
  },

  // Load a specific dataset by name
  loadDataset: function(name) {
    var dirPath = path.join(DATASETS_DIR, name);
    if (!fs.existsSync(dirPath)) return null;

    var profilePath = path.join(dirPath, 'full-profile.json');
    if (fs.existsSync(profilePath)) {
      return fs.readJsonSync(profilePath);
    }

    // Fall back to individual files
    var profile = { metadata: { generatedAt: new Date().toISOString() }, totals: {} };
    var cats = ['users', 'products', 'addresses', 'paymentMethods', 'searchQueries', 'testSessions'];
    cats.forEach(function(cat) {
      var f = path.join(dirPath, cat + '.json');
      if (fs.existsSync(f)) {
        profile[cat] = fs.readJsonSync(f);
        profile.totals[cat] = profile[cat].length;
        if (!profile.metadata.generatedAt) profile.metadata.generatedAt = fs.statSync(f).mtime.toISOString();
      }
    });
    return profile;
  },
};

// CLI entry point
function main() {
  var args = process.argv.slice(2);
  var command = args[0] || 'generate';

  if (command === 'generate') {
    var count = args[1] ? parseInt(args[1], 10) : undefined;
    var result = TestDataPipelineAgent.run({ userCount: count });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'list') {
    var datasets = TestDataPipelineAgent.listDatasets();
    console.log('Generated datasets:');
    if (datasets.length === 0) {
      console.log('  (none)');
    } else {
      datasets.forEach(function(d) {
        console.log('  - ' + d.name + ' (' + d.path + ')');
      });
    }
    return;
  }

  if (command === 'history') {
    var history = TestDataPipelineAgent.getRunHistory();
    console.log(JSON.stringify(history, null, 2));
    return;
  }

  console.log('Unknown command: ' + command);
  console.log('Commands: generate [count], list, history');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[TestDataPipelineAgent] CLI error:', e.message);
    process.exit(1);
  }
}

module.exports = TestDataPipelineAgent;


// Auto-registered metadata for AgentRegistry
module.exports.metadata = {
  "name": "Test Data Pipeline Agent",
  "version": "1.0.0",
  "description": "Synthetic test data generation for users, products, addresses, payments",
  "dependencies": [],
  "platforms": [
    "WEB",
    "ANDROID",
    "IOS",
    "API"
  ],
  "tags": [
    "data",
    "generation"
  ],
  "executionStage": "preflight",
  "priority": 35,
  "conditions": [
    {
      "type": "onDemand"
    }
  ],
  "retryPolicy": {
    "maxRetries": 0,
    "backoff": "none"
  },
  "strategy": "owner",
  "responsibilities": ["test-data-generation"],
  "lifecycle": "active"
};
