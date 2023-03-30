const https = require('https');
const fs = require('fs');
const TextToSVG = require('text-to-svg');
const AWS = require('aws-sdk');
const {convert} = require('convert-svg-to-png');
const fetch = require('node-fetch');

const storeIdHeader = 'X-PF-Store-Id';
const BUCKET_NAME = 'eyoung'
const AWS_CLIENT_ID = '*';
const AWS_CLIENT_SECRET = '*';

async function createPngFromCsv() {

    // Read from CSV. Gets the embrodery text to print
    const embroideryString = fs.readFileSync('list.csv', 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log(data);
    })
    //Creates SVG based on input text 
    const attributes = {fill: 'white', stroke: 'white'};
    const options = {x: 0, y: 0, fontSize: 72, anchor: 'top', attributes: attributes};
    
    const textToSVG = TextToSVG.loadSync();
    const svg = textToSVG.getSVG(embroideryString, options);
    console.log('SVG generated = ' + svg);

    const pngFileName = embroideryString + ".png";
    const png = await convert(svg);
    fs.writeFileSync(pngFileName, png, err => {
        if (err) {
            console.log(err);
        }
    });
    //Upload SVG to S3
    const s3 = new AWS.S3({
        accessKeyId: AWS_CLIENT_ID,
        secretAccessKey: AWS_CLIENT_SECRET
    });
    
    const fileContent = fs.readFileSync(pngFileName);
    const params = {
        Bucket: BUCKET_NAME,
        Key: pngFileName,
        Body: fileContent
    };
    
    const data = await s3.upload(params, (err, data) => {
        if (err) {
            throw err;
        }
        console.log(`File uploaded successfully. ${data.Location}`);
    }).promise();
    console.log(data)
    return data;
}

async function generateMockups(imgUrl) {
    const generateMockupsRequest = {
        "variant_ids" :[12689],
        "techniques": [
            {
                "key": "EMBROIDERY",
                "display_name": "Embroidery",
                "is_default": true
            }
        ],
        "files": [
            {
                "placement": "embroidery_front",
                "image_url": imgUrl,
                "position": {}
            }
        ]
    
    }

    const fetchOptions = {
        method: 'POST',
        body: JSON.stringify(generateMockupsRequest),
        headers: {"Authorization": "Bearer *", "X-PF-Store-Id": '10124725' }
    }

    const getOptions = {
        method: 'GET',
        headers: {"Authorization": "Bearer *", "X-PF-Store-Id": '10124725' }
    }
    
    const mockGenResponse = await fetch('https://api.printful.com/mockup-generator/create-task/491', fetchOptions).then(res => res.json());
    console.log (mockGenResponse)

    // let complete = false;
    // let retryCounter = 0;
    // while (!complete && retryCounter < 5) {
    //     console.log("request " + retryCounter);
    //     const mockTaskResponse = await fetch('https://api.printful.com/mockup-generator/task?task_key=' + mockGenResponse.result.task_key, getOptions).then(res => res.json());
    //     complete = mockTaskResponse.result.status === 'completed';
    //     console.log(mockTaskResponse.result);
    //     if (complete) {
    //         console.log(mockTaskResponse.result.mockups);
    //     }
    //     await new Promise(resolve => setTimeout(() => {console.log("inside timeout")}, 1000));
    //     retryCounter++;
    // }
    return makeRequest(mockGenResponse, getOptions, imgUrl);
}

async function createProductVariant(mockup) {
    const createProductVariantRequest = {
        sync_product: {
            name: "API hat"
        },
        sync_variants: [
            {
                retail_price: "29.50",
                variant_id: 12689,
                files: [
                    
                    {
                        type: "mockup",
                        title: "Mockup",
                        url: mockup.mockups[0].mockup_url
                    },
                    {
                        type: "default",
                        title: "Front",
                        url: mockup.img,
                        options: [
                            {
                                id: "auto_thread_color",
                                value: true
                            }
                        ]
                    }
                ]
            }
        ]
    }
    const fetchOptions = {
        method: 'POST',
        body: JSON.stringify(createProductVariantRequest),
        headers: {"Authorization": "Bearer *", "X-PF-Store-Id": '10124725' }
    }

    const createProductVarientResponse = await fetch('https://api.printful.com/store/products', fetchOptions).then(res => res.json())
    console.log ("Create product variant response: ");
    console.log (createProductVarientResponse);

}

// creates PNG and uploads into S3
const createPngFromSdvPromise = createPngFromCsv();
createPngFromSdvPromise.then((value) => {
    generateMockups(value.Location).then((value) => {
        console.log("value 2 " + value.img);
        console.log("value 2 " + value.mockups[0]);
        createProductVariant(value);
    });
});

function makeRequest(mockGenResponse, getOptions, imgUrl) {
    let complete = false;
    let retryCounter = 0;

    return new Promise(async (resolve, reject) => {
        while (!complete && retryCounter < 5) {
            const mockTaskResponse = await fetch('https://api.printful.com/mockup-generator/task?task_key=' + mockGenResponse.result.task_key, getOptions).then(res => res.json());
            complete = mockTaskResponse.result.status === 'completed';
            console.log(mockTaskResponse.result);
            if (complete) {
                console.log(mockTaskResponse.result.mockups);
                mockTaskResponse.result.mockups.imgUrl = imgUrl;
                resolve({mockups: mockTaskResponse.result.mockups, img: imgUrl});
            } else {
                await new Promise(res => setTimeout(res, 5000));
                retryCounter++;
            }
        }

        if (!complete) {
            reject(new Error('Request did not complete after 5 retries.'));
        }
    });
}
