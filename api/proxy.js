// Multi-URL CORS Proxy with Failover for Vercel
// Node.js 24.x Compatible

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Sleep function
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Random delay 10-15 sec
  const getRandomDelay = () => Math.floor(Math.random() * 5000) + 10000;

  // Collect URLs from query
  let urls = [];
  
  if (req.query.url) {
    if (Array.isArray(req.query.url)) {
      urls = [...req.query.url];
    } else {
      urls.push(req.query.url);
    }
  }

  // Check url1, url2, url3...
  for (let i = 1; i <= 10; i++) {
    const key = i === 1 ? 'url' : `url${i}`;
    const val = req.query[key];
    if (val && typeof val === 'string' && !urls.includes(val)) {
      urls.push(val);
    }
  }

  // Usage instructions
  if (urls.length === 0) {
    return res.status(200).json({
      status: 'ready',
      message: 'Multi-URL CORS Proxy with Failover! ✅',
      features: [
        '🔄 Multiple backup URLs',
        '⏱️ 10-15s delay between retries',
        '📦 Exact data passthrough'
      ],
      usage: {
        single: '/api/proxy?url=https://api1.com/data',
        multiple: '/api/proxy?url=https://api1.com/data&url=https://api2.com/data&url=https://api3.com/data'
      },
      example: 'https://api-proxys.vercel.app/api/proxy?url=https://jsonplaceholder.typicode.com/todos/1&url=https://jsonplaceholder.typicode.com/todos/2'
    });
  }

  console.log(`[Total URLs: ${urls.length}] ${urls.join(' → ')}`);

  // Try each URL
  for (let i = 0; i < urls.length; i++) {
    const currentUrl = urls[i];
    console.log(`\n[URL ${i + 1}/${urls.length}]: ${currentUrl}`);

    // 3 retries per URL
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`  Attempt ${attempt}/3...`);
        
        const targetUrl = new URL(currentUrl);
        
        // Add other query params to URL
        Object.keys(req.query).forEach(key => {
          if (key !== 'url' && !key.startsWith('url')) {
            targetUrl.searchParams.append(key, req.query[key]);
          }
        });

        // Clean headers
        const headers = {};
        const allowed = ['authorization', 'content-type', 'accept', 'user-agent', 'x-api-key'];
        
        Object.keys(req.headers).forEach(key => {
          if (allowed.includes(key.toLowerCase())) {
            headers[key] = req.headers[key];
          }
        });

        const fetchOptions = {
          method: req.method,
          headers: headers,
          redirect: 'follow'
        };

        // Add body for POST/PUT/PATCH
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
          fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
        }

        // Fetch with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        fetchOptions.signal = controller.signal;

        const response = await fetch(targetUrl.toString(), fetchOptions);
        clearTimeout(timeout);

        const contentType = response.headers.get('content-type') || '';
        
        // Parse response
        let data;
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else if (contentType.includes('text/')) {
          data = await response.text();
        } else {
          data = await response.arrayBuffer();
        }

        console.log(`  ✅ Success! Status: ${response.status}`);
        
        // Return exact original data
        res.status(response.status);
        res.setHeader('Content-Type', contentType || 'application/json');
        
        if (contentType.includes('application/json')) {
          return res.json(data);
        } else if (contentType.includes('text/')) {
          return res.send(data);
        } else {
          return res.send(Buffer.from(data));
        }

      } catch (error) {
        console.error(`  ❌ Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < 3) {
          const delay = getRandomDelay();
          console.log(`  ⏳ Waiting ${delay/1000}s...`);
          await sleep(delay);
        }
      }
    }

    console.log(`❌ URL ${i + 1} failed all retries`);
    
    // Wait before next URL
    if (i < urls.length - 1) {
      const delay = getRandomDelay();
      console.log(`⏳ Switching to next URL in ${delay/1000}s...`);
      await sleep(delay);
    }
  }

  // All failed
  console.error('[ALL URLS FAILED]');
  res.status(502).json({
    error: 'All URLs failed',
    tried: urls.length,
    urls: urls
  });
};
