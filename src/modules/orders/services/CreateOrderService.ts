import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import IUpdateProductsQuantityDTO from '@modules/products/dtos/IUpdateProductsQuantityDTO';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateProductService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExist = await this.customersRepository.findById(customer_id);

    if (!customerExist) {
      throw new AppError('This customer does not exists');
    }

    const productsId = products.map(product => ({ id: product.id }));

    const findProducts = await this.productsRepository.findAllById(productsId);

    if (findProducts.length !== products.length) {
      throw new AppError('One or more products was not found');
    }

    const updatedQuantities: IUpdateProductsQuantityDTO[] = [];

    const updatedProducts = findProducts.map(findProduct => {
      const orderProduct = products.find(
        product => product.id === findProduct.id,
      );

      if (orderProduct) {
        if (findProduct.quantity < orderProduct.quantity) {
          throw new AppError(
            `
              Product ${findProduct.name} has quantity available in stock: ${findProduct.quantity}\n
              Quantity requested: ${orderProduct.quantity}
            `,
          );
        }

        updatedQuantities.push({
          id: orderProduct.id,
          quantity: findProduct.quantity - orderProduct.quantity,
        });

        return {
          ...findProduct,
          quantity: orderProduct.quantity,
        };
      }

      return findProduct;
    });

    await this.productsRepository.updateQuantity(updatedQuantities);

    const order = await this.ordersRepository.create({
      customer: customerExist,
      products: updatedProducts.map(product => ({
        product_id: product.id,
        price: product.price,
        quantity: product.quantity,
      })),
    });

    return order;
  }
}

export default CreateProductService;
