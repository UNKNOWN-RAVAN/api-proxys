// CORS Proxy with Multiple URL Failover
// Pehla fail = Dusra try | Dusra fail = Teesra try | And so on...

const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  )
  
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }
  return await fn(req, res)
}

// Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Random delay 10-15 sec
const getRandomDelay = () => Math.floor(Math.random() * 5000) + 10000

// Fetch with retry for single URL
const fetchWithRetry = async (targetUrl, req, maxRetries = 3) => {
  let lastError = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[URL: ${targetUrl}] Attempt ${attempt}/${maxRetries}`)
      
      // Clean headers
      const headers = {}
      const allowedHeaders = [
        'authorization', 'content-type', 'accept', 
        'user-agent', 'x-api-key', 'x-requested-with'
      ]
      
      Object.keys(req.headers).forEach(key => {
        if (allowedHeaders.includes(key.toLowerCase())) {
          headers[key] = req.headers[key]
        }
      })
      
      const fetchOptions = {
        method: req.method,
        headers: headers,
        redirect: 'follow'
      }
      
      // Add body
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.body) {
        fetchOptions.body = typeof req.body === 'object' 
          ? JSON.stringify(req.body) 
          : req.body
      }
      
      // Timeout
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)
      fetchOptions.signal = controller.signal
      
      const response = await fetch(targetUrl, fetchOptions)
      clearTimeout(timeout)
      
      // Success! Return response details
      const contentType = response.headers.get('content-type') || ''
      let data
      
      if (contentType.includes('application/json')) {
        data = await response.json()
      } else if (contentType.includes('text/')) {
        data = await response.text()
      } else {
        data = await response.arrayBuffer()
      }
      
      return {
        success: true,
        status: response.status,
        contentType: contentType,
        data: data,
        url: targetUrl,
        attempt: attempt
      }
      
    } catch (error) {
      lastError = error
      console.error(`[URL: ${targetUrl}] Attempt ${attempt} failed: ${error.message}`)
      
      if (attempt < maxRetries) {
        const delay = getRandomDelay()
        console.log(`[Waiting ${delay/1000}s...]`)
        await sleep(delay)
      }
    }
  }
  
  return {
    success: false,
    error: lastError?.message || 'Failed after retries',
    url: targetUrl,
    attempts: maxRetries
  }
}

const handler = async (req, res) => {
  // Multiple URLs collect karo
  let urls = []
  
  // Check query params - url, url1, url2, url3... ya phir url array
  if (req.query.url) {
    if (Array.isArray(req.query.url)) {
      urls = req.query.url
    } else {
      urls.push(req.query.url)
    }
  }
  
  // Extra url1, url2, url3... check karo
  for (let i = 1; i <= 10; i++) {
    const key = i === 1 ? 'url' : `url${i}`
    if (req.query[key] && !urls.includes(req.query[key])) {
      urls.push(req.query[key])
    }
  }
  
  // Usage instructions
  if (urls.length === 0) {
    return res.json({
      status: 'ready',
      message: 'Multi-URL CORS Proxy with Failover! ✅',
      features: [
        '🔄 Multiple backup URLs support',
        '⏱️ 10-15s delay between retries',
        '⏱️ 10-15s delay between URL switches',
        '📦 Exact data passthrough'
      ],
      usage: {
        single: '/api/proxy?url=https://api1.com/data',
        multiple_same: '/api/proxy?url=https://api1.com/data&url=https://api2.com/data&url=https://api3.com/data',
        multiple_numbered: '/api/proxy?url=https://api1.com/data&url2=https://api2.com/data&url3=https://api3.com/data'
      },
      example: 'https://your-app.vercel.app/api/proxy?url=https://primary-api.com/data&url=https://backup1-api.com/data&url=https://backup2-api.com/data',
      note: 'Pehla URL fail ho toh dusra try, dusra fail ho toh teesra, aur aise hi chalta rahega!'
    })
  }
  
  console.log(`[Total URLs: ${urls.length}] ${urls.join(' → ')}`)
  
  // Har URL try karo sequentially
  let lastError = null
  
  for (let i = 0; i < urls.length; i++) {
    const currentUrl = urls[i]
    console.log(`\n[Trying URL ${i + 1}/${urls.length}]: ${currentUrl}`)
    
    const result = await fetchWithRetry(currentUrl, req, 3)
    
    if (result.success) {
      console.log(`✅ Success from URL ${i + 1}!`)
      
      // Send exact original response
      res.status(result.status)
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      
      if (result.contentType) {
        res.setHeader('Content-Type', result.contentType)
      }
      
      // Return exact data
      if (result.contentType.includes('application/json')) {
        return res.json(result.data)
      } else if (result.contentType.includes('text/')) {
        return res.send(result.data)
      } else {
        return res.send(Buffer.from(result.data))
      }
    }
    
    // Fail ho gaya, next URL try karo
    console.log(`❌ URL ${i + 1} failed completely`)
    lastError = result.error
    
    // Agar aur URLs bachi hain toh wait karo
    if (i < urls.length - 1) {
      const delay = getRandomDelay()
      console.log(`[Switching to next URL in ${delay/1000}s...]`)
      await sleep(delay)
    }
  }
  
  // Sab URLs fail ho gayi
  console.error('[ALL URLS FAILED]')
  
  res.status(502).json({
    error: 'All URLs failed after maximum retries',
    urls_tried: urls.length,
    last_error: lastError,
    urls: urls
  })
}

module.exports = allowCors(handler)
