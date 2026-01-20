import Order from "../models/Order.js";
import Product from "../models/Product.js";
import stripe from 'stripe'
import User from '../models/User.js'

//place Order COD : api/order/cod
export const placeOrderCOD = async(req , res)=>{
    try {
        const userId = req.userId; 
        const {items, address} = req.body; 
        
        if(!address || items.length ===0){
            return res.json({success:false, message:'Invalid data'})
        }
        
        let amount = await items.reduce(async(accPromise, item) => {
            const acc = await accPromise;
            const product = await Product.findById(item.product);
            return acc + product.offerPrice * item.quantity;
        }, Promise.resolve(0))

        amount+=Math.floor(amount*0.02);

        await Order.create({
            userId, 
            items,
            amount,
            address,
            paymentType: "COD",
        })
        
        res.json({success:true, message: 'Order placed successfully'})

    } catch (error) {
        console.log(error.message)
        res.json({success:false, message: error.message}) 
    }
}

//place Order COD : api/order/stripe
export const placeOrderStripe = async(req , res)=>{
    try {
        const userId = req.userId; 
        const {items, address} = req.body; 
        const {origin} = req.headers;
        
        if(!address || items.length ===0){
            return res.json({success:false, message:'Invalid data'})
        }

        let productData = [];
        
        let amount = await items.reduce(async(accPromise, item) => {
            const acc = await accPromise;
            const product = await Product.findById(item.product);
            productData.push({
                name: product.name,
                price: product.offerPrice,
                quantity: item.quantity
            })
            return acc + product.offerPrice * item.quantity;
        }, Promise.resolve(0))

        amount+=Math.floor(amount*0.02);

        const order = await Order.create({
            userId, 
            items,
            amount,
            address,
            paymentType: "Online",
        })

        // Stripe Gateway Initialize
        const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY)

        // Create line items for stripe

        const line_items = productData.map((item)=>{
            return{
                price_data:{
                    currency : "usd",
                    product_data:{
                        name: item.name,
                    },
                    unit_amount: (item.price + item.price *  0.02) * 100 
                },
                quantity: item.quantity,
            }
        })

        // create session

        const session = await stripeInstance.checkout.sessions.create({
            line_items,
            mode: "payment",
            success_url:`${origin}/loader?next=my-orders`,
            cancel_url: `${origin}/cart`,
            metadata:{
                orderId: order._id.toString(),
                userId,
            }
        })
        return res.json({success:true, url: session.url })

    } catch (error) {
        console.log(error.message)
        res.json({success:false, message: error.message}) 
    }
}

// Stripe webhooks to verify Payments Actions : / stripe

export const stripeWebhooks = async(req , res)=>{
    const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);

    const sig = req.headers["stripe-signature"];
    let event;

    console.log("Webhook received!")

    try {
        event = stripeInstance.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        )
        console.log("Event type:", event.type) 
    } catch (error) {
        return res.status(400).send(`Webhook Error: ${error.message}`)
    }
    
    //Handle the event
    switch (event.type) {
    case "checkout.session.completed":{ 
        const session = event.data.object;
        
        const {orderId, userId} = session.metadata;

        //Mark Payment as Paid
        await Order.findByIdAndUpdate(orderId,{isPaid: true})

        // Clear user cart
        await User.findByIdAndUpdate(userId, {cartItems: {}})
        break;
    }
    case "checkout.session.async_payment_failed":{ 
        const session = event.data.object;
        
        const {orderId} = session.metadata;
        await Order.findByIdAndDelete(orderId);
        break;
    }

    default:
        console.log(`Unhandled event type ${event.type}`)
        break;
}
    res.json({received: true})

}

//place Order COD : api/order/user
export const getUserOrders = async(req , res)=>{
    try {
        const userId = req.userId; 
        const orders = await Order.find({
            userId,
            $or: [{paymentType: "COD"}, {isPaid: true}]
        }).populate("items.product address").sort({createdAt:-1});
        res.json({success:true, orders})
    } catch (error) {
        console.log(error.message)
        res.json({success:false, message: error.message}) 
    }
}


// Get All Orders (for seller/admin) : /api/order/seller
export const getAllOrders = async(req , res)=>{
    try {
        
        const orders = await Order.find({
            $or: [{paymentType: "COD"}, {isPaid: true}]
        }).populate("items.product address").sort({createdAt:-1});
        res.json({success:true, orders})
    } catch (error) {
        console.log(error.message)
        res.json({success:false, message: error.message}) 
    }
}